---
title: My findings about linux drivers
date: 2026-09-17
tags: [linux,drivers]
---

# Linux Drivers

## What is a driver
- Driver is a piece of code that lies inside the kernel space.
- It abstracts the hardware complexities for the system.
- A device driver dont have to watch for the policies. It simply want to translate what the hardware is saying.
    - Eg: A disk driver will not implement policies of access. It will simply convert the hardcoded data into software data blocks.
- This will make a particular driver usable for different devices with diferent use cases and policies.
- Even though it can also abstract some of the software complexities such as byteb read capablity.

## Kernel duties
- Process Management
- Memory Management
- Filesystems
- Device management
- Networking

Kernel is playing balls with these without skipping a beat. Have some respect!!
![Kernel](images/image.png)


## Loadable Modules
Unlike peasent windows systems which asks for a reboot even when you breath, Linux can load and unload features from the system while running. These type of drivers are called **modules**. ```insmod``` program is used to load and ```rmmmod``` is used to unload. In the view of linux there are three type of modules. This classification is based on how the user space is communicating with the driver in the kernel space.
- charecter modules
- block modules
- network modules

### Charecter modules
- These modules are accesed byte by byte.
- The device should implement ```open,close,write,read``` system calls minimum for this driver to work.
- These drivers can provide data as streams. Comes with the issue of sequential reading.
- The best example for these are the FTDI drivers. The driver underneath will take care of all the UART hardware complexities and provide the data stream as a charecter file stream located at ```/dev/ttyUSB-MCHP*```. Now any user program like minicom can take that input as files and process them.

### Block modules
- These are differed from charecter modules by how they interacts with the kernel. They can process data as blocks (usually 512 bytes).
- But linux treats them like charecter devices and allow us to write any number of bytes.
- These will also be located in the ```/dev/``` folder.

### Network modules
- These drivers will appear to the user space as network loopback devices.
- Usually stream oriented packet devices.

## Module development API
Thankfully linux provides a good API for developing a module. This is included in the compiler path and accessable within the system. The two header files provides the needed APIs are
    - ```linux/init.h```
    - ```linux/module.h```

### Module entry point
For the entry point we have ```module_init()``` and ```module_exit()``` functions. This will take a function pointer and call that function when a module is ready to be initialized and exited. The function pointer should be a type of:
```c
static int (* callback) (void);
```
Below is a hello world code.
```c
#include <linux/init.h>
#include <linux/module.h>
MODULE_LICESE("GPL");  // Specify license

static int my_module_init(void){
    printk(KERN_ALERT "Module is inited\n");
    return 0;
}

static int my_module_exit(void){
    printk(KERN_ALERT "Module is exited\n");
    return 0;
}

module_init(my_module_init);
module_exit(my_module_exit);

```
Here printk is a function provided by module.h to print something in kernel logs. KERN_ALERT is a macro which defines the kernel's prefix for logging and priority.

When we are coding inside the kernel space there is no Standard C library support. Even if we can include them, It will not be linked from the kernel. Beware of that. Also the errors in kernel modules are much severe than in application code. It might kill you.

Also unlike the stack of user space programs, kernel space have a very less stack size. So reduce the budget of memory. If you need more memory, dynamically allocate them.

### Compiling a module
The GNU extended make provides the utils for building a module. we just have to mention the object file to an ```obj-m``` variable.

```Makefile
obj-m := mymod.o
```
if you have multiple module under construction,
```Makefile
obj-m := mymod1.o
obj-m += mymod2.o
```
If you are building for the system you were right in, just call ```make``` 

### Building for another device right from the kernel source
If you look at the ```drivers/``` folder in the kernel source, all device drivers are categorised in this folder. For our current simple driver get inside the ```misc/``` folder. Here you can see a lot of ```.c,.o,.ko``` files which are part of various modules. We can copy our C file here for the module.

When we look at the Makfile in that directory we can see something in the format of this
```Makefile
obj-$(CONFIG_NAMEHERE)      += modulename.o
```
This ```CONFIG_NAMEHERE``` variable will be set by the Kconfig program. and if that valye is 'm', make will interpret this as ```obj-m  += modulename.o``` and build it as a module. If it is 'y' it will be built as a built-in driver and if it is 'n' it will be ignored and not built.

After building, the kernels build system will automatically add it to the kernel image.