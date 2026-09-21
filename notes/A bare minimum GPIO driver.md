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
- And A C library for easy use of my nowhere complicated driver (who asked?).

