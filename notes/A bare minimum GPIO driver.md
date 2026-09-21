---
title: My attempt of a first linux driver
date: 2026-09-21
tags: [linux,driver,diy,gpio,wishmeluck]
---

# A simple linux driver
A simple GPIO LED driver with some cool technical terms.
# List of what I know
- Nothing
- Absolutely nothing
- Nothing phone 3A

## Objective
A file should be created in the userspace. whenever a user writes a number between 1 - 8, LED with that index will be toggled. also if user tries to read, he will get a list of led indexes and their states. You noticed the index starting from 1. That is just to piss of whomever going to use this shit driver. f*ck off.

## A short word about the internals
- PIC64GX already have a device tree and nodes for GPIOs.
- We have to get the register addresses and offsets required for manipulating register values.
- In pic64gx1000, GPIOs are divided into different banks to save the world.
- We just have to find which bank these LEDs are mapped and access that GPIO node.

## What file operations our driver should implement.
- An ```open``` function which will check for multiple access and deny if file already in use. This will also create a state machine for leds and initialize all leds to off and set all GPIOs as output.
- A ```read``` function that will give a byte with led states with MSB representing index 1.
- A ```write``` function that takes 1-8 as ascii (or a byte to reperesent all 8 leds together later) and toggle that led.

## Things to learn
- What the device tree will give me and what else should I calculate.
- How do I access the details said in the device tree.
- Once I get the register address, How do I write something into the registers
- How do I get a file as an interface for my driver
- And a C library for easy use of my nowhere complicated driver (who asked?).

## The device tree
When a kernel packed into fitImage, the device tree blob (dtb) is embedded into the fitimage. This blob is created by multiple device tree files in the kernel source code. We have to be familiar with two types of device tree files. ```.dts``` files and ```.dtsi``` files. dtsi file is an overall picture. dts file kind of overwrites it. Here is the dtsi file and dts file for GPIO in PIC64GX1000.

```dtsi
		gpio0: gpio@20120000 {
			compatible = "microchip,pic64gx-gpio", "microchip,mpfs-gpio";
			reg = <0x0 0x20120000 0x0 0x1000>;
			interrupt-parent = <&irqmux>;
			interrupt-controller;
			#interrupt-cells = <2>;
			interrupts = <0>, <1>, <2>, <3>,
				     <4>, <5>, <6>, <7>,
				     <8>, <9>, <10>, <11>,
				     <12>, <13>;
			clocks = <&clkcfg CLK_GPIO0>;
			gpio-controller;
			#gpio-cells = <2>;
			ngpios = <14>;
			status = "disabled";
		};

		gpio1: gpio@20121000 {
			compatible = "microchip,pic64gx-gpio", "microchip,mpfs-gpio";
			reg = <0x0 0x20121000 0x0 0x1000>;
			interrupt-parent = <&irqmux>;
			interrupt-controller;
			#interrupt-cells = <2>;
			interrupts = <32>, <33>, <34>, <35>,
				     <36>, <37>, <38>, <39>,
				     <40>, <41>, <42>, <43>,
				     <44>, <45>, <46>, <47>,
				     <48>, <49>, <50>, <51>,
				     <52>, <53>, <54>, <55>;
			clocks = <&clkcfg CLK_GPIO1>;
			gpio-controller;
			#gpio-cells = <2>;
			ngpios = <24>;
			status = "disabled";
		};

		gpio2: gpio@20122000 {
			compatible = "microchip,pic64gx-gpio", "microchip,mpfs-gpio";
			reg = <0x0 0x20122000 0x0 0x1000>;
			interrupt-parent = <&irqmux>;
			interrupt-controller;
			#interrupt-cells = <2>;
			interrupts = <64>, <65>, <66>, <67>,
				     <68>, <69>, <70>, <71>,
				     <72>, <73>, <74>, <75>,
				     <76>, <77>, <78>, <79>,
				     <80>, <81>, <82>, <83>,
				     <84>, <85>, <86>, <87>,
				     <88>, <89>, <90>, <91>,
				     <92>, <93>, <94>, <95>;
			clocks = <&clkcfg CLK_GPIO2>;
			gpio-controller;
			#gpio-cells = <2>;
			ngpios = <32>;
			status = "disabled";
		};
```

And here is the corresponding dts file
```dts
&gpio0 {
	status ="okay";
	gpio-line-names =
		"", "", "", "", "", "", "", "",
		"", "", "", "", "MIPI_CAM_RESET", "MIPI_CAM_STANDBY";
};

&gpio1 {
	status ="okay";
	gpio-line-names =
		"", "", "LED1", "LED2", "LED3", "LED4", "LED5", "LED6",
		"LED7", "LED8", "", "", "", "", "", "",
		"", "", "", "", "HDMI_HPD", "", "", "GPIO_1_23";
};

&gpio2 {
	pinctrl-names = "default";
	pinctrl-0 = <&mdio1_gpio>, <&spi0_gpio>, <&can0_gpio>, <&pcie_gpio>,
		    <&qspi_gpio>, <&uart3_gpio>, <&uart4_gpio>, <&can1_gpio>;
	status ="okay";
	gpio-line-names =
		"", "", "", "", "", "", "SWITCH2", "USR_IO12",
		"DIP1", "DIP2", "", "DIP3", "USR_IO1", "USR_IO2", "USR_IO7", "USR_IO8",
		"USR_IO3", "USR_IO4", "USR_IO5", "USR_IO6", "", "", "USR_IO9", "USR_IO10",
		"DIP4", "USR_IO11", "", "", "SWITCH1", "", "", "";
};
```

You can see that dtsi contains all the necessory info and names and status (acts like an enable) for each GPIO. From here itself we can see that the GPIO LEDs are connected into gpio1. If you are not sure check this link
[GPIO LED mapping PIC64GX1000](https://developerhelp.microchip.com/xwiki/bin/view/products/mcu-mpu/64bit-mpu/pic64-applications-gpio/)

Here we are intrested in these 3 lines
```dts
        ...
		gpio1: gpio@20121000 {
			compatible = "microchip,pic64gx-gpio", "microchip,mpfs-gpio";
			reg = <0x0 0x20121000 0x0 0x1000>;
        ...
```
We got the node name, the compatiblity string and where the register address, offset, and size is saved. Node name is simply node name. The compatiblity string is used to identify a device node by the device driver. Our driver is going to identify the device tree entry using this string and node name. Now the reg variable, ```0x20121000``` is the base address and ```0x0``` is the offset and ```0x1000``` is the size of region for that GPIO bank. You may say we can hardcode this into our code and get rid of the device tree. If you do that, you'll be added to the naughty list of santa clause. And also your driver will not be portable to another device with another register mapping. So please don't do that.

Now we can tackle the device tree part. for that we will write a helloworld driver and try to get the register address and print it in the dmsgs. By the way here is a helloworld driver I stole from ['Linux Device Drivers'](https://lwn.net/Kernel/LDD3/) book. I reffered a lot from this book. great book from 2002.
```c
#include <linux/init.h>
#include <linux/module.h>

MODULE_LICENSE("Dual BSD/GPL");

static int hello_init(void) {
    printk(KERN_ALERT "Hello, world\n");
    return 0;
}
static void hello_exit(void) {
    printk(KERN_ALERT "Goodbye, cruel world\n");
}

module_init(hello_init);
module_exit(hello_exit);
```
Here we are defining two functions to call when the module is getting loaded. If you like to hear about this more about from me check [This article](https://vijaysatheesh.github.io/journal/viewer.html?file=notes%2FLinux%20Driver.md).

For finding the device tree node, there are two approaches. One is the preffered one to use the platform device API provided by linux. For this we only need to know the compatiblity string and this API will fetch the node for us.

The another method is the manual lookup using the ```of.h``` library. For this we need to know the exact path of the device tree. This approach is not that much portable. But we will use this method first and will later port the device tree lookup to use platform device API.

