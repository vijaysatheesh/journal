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
