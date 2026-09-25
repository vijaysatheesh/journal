---
title: Postmortem of Microchip Polarfire GPIO driver
date: 2026-09-25
tags: [linux,drivers,GPIO,Analysis]
---

# Microchip Polarfire SOC GPIO driver
Driver so goated that they reused the same driver for pic64gx1000. Just kidding. Polarfire SOC follows exactly same GPIO architecture. In this article we'll disect the ```gpio-mpfs.c``` driver found in the ```drivers/gpio/``` folder in the linux kernel. For that, first I'll dump the driver code here. And we'll take a top down approach starting from probing to register writing. I'm putting back the seatbelt sign on. Happy journey.

## The sourcecode
```c
// SPDX-License-Identifier: (GPL-2.0)
/*
 * Microchip PolarFire SoC (MPFS) GPIO controller driver
 *
 * Copyright (c) 2018-2024 Microchip Technology Inc. and its subsidiaries
 */

#include <linux/clk.h>
#include <linux/device.h>
#include <linux/errno.h>
#include <linux/gpio/driver.h>
#include <linux/init.h>
#include <linux/mod_devicetable.h>
#include <linux/of_irq.h>
#include <linux/platform_device.h>
#include <linux/property.h>
#include <linux/regmap.h>
#include <linux/spinlock.h>

#define MPFS_GPIO_CTRL(i)		(0x4 * (i))
#define MPFS_MAX_NUM_GPIO		32
#define MPFS_GPIO_EN_INT		BIT(3)
#define MPFS_GPIO_EN_OUT_BUF		BIT(2)
#define MPFS_GPIO_EN_IN			BIT(1)
#define MPFS_GPIO_EN_OUT		BIT(0)
#define MPFS_GPIO_DIR_MASK		GENMASK(2, 0)

#define MPFS_GPIO_TYPE_INT_EDGE_BOTH	0x80
#define MPFS_GPIO_TYPE_INT_EDGE_NEG	0x60
#define MPFS_GPIO_TYPE_INT_EDGE_POS	0x40
#define MPFS_GPIO_TYPE_INT_LEVEL_LOW	0x20
#define MPFS_GPIO_TYPE_INT_LEVEL_HIGH	0x00
#define MPFS_GPIO_TYPE_INT_MASK		GENMASK(7, 5)
#define MPFS_IRQ_REG			0x80

#define MPFS_INP_REG			0x84
#define COREGPIO_INP_REG		0x90
#define MPFS_OUTP_REG			0x88
#define COREGPIO_OUTP_REG		0xA0

struct mpfs_gpio_reg_offsets {
	u8 inp;
	u8 outp;
};

struct mpfs_gpio_chip {
	struct regmap *regs;
	const struct mpfs_gpio_reg_offsets *offsets;
	struct gpio_chip gc;
};

static const struct regmap_config mpfs_gpio_regmap_config = {
	.reg_bits = 32,
	.reg_stride = 4,
	.val_bits = 32,
};

static int mpfs_gpio_direction_input(struct gpio_chip *gc, unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_IN);

	return 0;
}

static int mpfs_gpio_direction_output(struct gpio_chip *gc, unsigned int gpio_index, int value)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_OUT | MPFS_GPIO_EN_OUT_BUF);
	regmap_update_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp, BIT(gpio_index),
			   value << gpio_index);

	return 0;
}

static int mpfs_gpio_get_direction(struct gpio_chip *gc,
				   unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	unsigned int gpio_cfg;

	regmap_read(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index), &gpio_cfg);
	if (gpio_cfg & MPFS_GPIO_EN_IN)
		return GPIO_LINE_DIRECTION_IN;

	return GPIO_LINE_DIRECTION_OUT;
}

static int mpfs_gpio_get(struct gpio_chip *gc, unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	if (mpfs_gpio_get_direction(gc, gpio_index) == GPIO_LINE_DIRECTION_OUT)
		return regmap_test_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp, BIT(gpio_index));
	else
		return regmap_test_bits(mpfs_gpio->regs, mpfs_gpio->offsets->inp, BIT(gpio_index));
}

static int mpfs_gpio_set(struct gpio_chip *gc, unsigned int gpio_index, int value)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	int ret;

	mpfs_gpio_get(gc, gpio_index);

	ret = regmap_update_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp,
				 BIT(gpio_index), value << gpio_index);

	mpfs_gpio_get(gc, gpio_index);

	return ret;
}

static int mpfs_gpio_irq_set_type(struct irq_data *data, unsigned int type)
{
	struct gpio_chip *gc = irq_data_get_irq_chip_data(data);
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	int gpio_index = irqd_to_hwirq(data);
	u32 interrupt_type;

	switch (type) {
	case IRQ_TYPE_EDGE_BOTH:
		interrupt_type = MPFS_GPIO_TYPE_INT_EDGE_BOTH;
		break;
	case IRQ_TYPE_EDGE_FALLING:
		interrupt_type = MPFS_GPIO_TYPE_INT_EDGE_NEG;
		break;
	case IRQ_TYPE_EDGE_RISING:
		interrupt_type = MPFS_GPIO_TYPE_INT_EDGE_POS;
		break;
	case IRQ_TYPE_LEVEL_HIGH:
		interrupt_type = MPFS_GPIO_TYPE_INT_LEVEL_HIGH;
		break;
	case IRQ_TYPE_LEVEL_LOW:
		interrupt_type = MPFS_GPIO_TYPE_INT_LEVEL_LOW;
		break;
	}

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_TYPE_INT_MASK, interrupt_type);

	return 0;
}

static void mpfs_gpio_irq_unmask(struct irq_data *data)
{
	struct gpio_chip *gc = irq_data_get_irq_chip_data(data);
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	int gpio_index = irqd_to_hwirq(data);

	gpiochip_enable_irq(gc, gpio_index);
	mpfs_gpio_direction_input(gc, gpio_index);
	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			     MPFS_GPIO_EN_INT, MPFS_GPIO_EN_INT);
}

static void mpfs_gpio_irq_mask(struct irq_data *data)
{
	struct gpio_chip *gc = irq_data_get_irq_chip_data(data);
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	int gpio_index = irqd_to_hwirq(data);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_EN_INT, 0);
	gpiochip_disable_irq(gc, gpio_index);
}

static const struct irq_chip mpfs_gpio_irqchip = {
	.name = "MPFS GPIO",
	.irq_set_type = mpfs_gpio_irq_set_type,
	.irq_mask = mpfs_gpio_irq_mask,
	.irq_unmask = mpfs_gpio_irq_unmask,
	.flags = IRQCHIP_IMMUTABLE | IRQCHIP_MASK_ON_SUSPEND,
	GPIOCHIP_IRQ_RESOURCE_HELPERS,
};

static void mpfs_gpio_irq_handler(struct irq_desc *desc)
{
	struct irq_chip *irqchip = irq_desc_get_chip(desc);
	struct mpfs_gpio_chip *mpfs_gpio = irq_desc_get_handler_data(desc);
	unsigned int status;
	int i;

	/*
	 * Since the parent may be a muxed/"non-direct" interrupt, this
	 * interrupt may not be for us.
	 */
	regmap_read(mpfs_gpio->regs, MPFS_IRQ_REG, &status);
	if (!status)
		return;

	chained_irq_enter(irqchip, desc);

	for_each_set_bit(i, (unsigned long *)&status, mpfs_gpio->gc.ngpio) {
		generic_handle_irq(irq_find_mapping(mpfs_gpio->gc.irq.domain, i));
		regmap_write(mpfs_gpio->regs, MPFS_IRQ_REG, BIT(i));
	}

	chained_irq_exit(irqchip, desc);
}

static int mpfs_gpio_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct device_node *node = pdev->dev.of_node;
	struct mpfs_gpio_chip *mpfs_gpio;
	struct gpio_irq_chip *girq;
	struct clk *clk;
	void __iomem *base;
	int ngpios, nirqs, ret;

	mpfs_gpio = devm_kzalloc(dev, sizeof(*mpfs_gpio), GFP_KERNEL);
	if (!mpfs_gpio)
		return -ENOMEM;

	mpfs_gpio->offsets = device_get_match_data(&pdev->dev);

	base = devm_platform_ioremap_resource(pdev, 0);
	if (IS_ERR(base))
		return dev_err_probe(dev, PTR_ERR(base), "failed to ioremap memory resource\n");

	mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);
	if (IS_ERR(mpfs_gpio->regs))
		return dev_err_probe(dev, PTR_ERR(mpfs_gpio->regs),
				     "failed to initialise regmap\n");

	clk = devm_clk_get_enabled(dev, NULL);
	if (IS_ERR(clk))
		return dev_err_probe(dev, PTR_ERR(clk), "failed to get and enable clock\n");

	ngpios = MPFS_MAX_NUM_GPIO;
	device_property_read_u32(dev, "ngpios", &ngpios);
	if (ngpios > MPFS_MAX_NUM_GPIO)
		ngpios = MPFS_MAX_NUM_GPIO;

	mpfs_gpio->gc.direction_input = mpfs_gpio_direction_input;
	mpfs_gpio->gc.direction_output = mpfs_gpio_direction_output;
	mpfs_gpio->gc.get_direction = mpfs_gpio_get_direction;
	mpfs_gpio->gc.get = mpfs_gpio_get;
	mpfs_gpio->gc.set = mpfs_gpio_set;
	mpfs_gpio->gc.base = -1;
	mpfs_gpio->gc.ngpio = ngpios;
	mpfs_gpio->gc.label = dev_name(dev);
	mpfs_gpio->gc.parent = dev;
	mpfs_gpio->gc.owner = THIS_MODULE;

	nirqs = of_irq_count(node);
	if (nirqs > MPFS_MAX_NUM_GPIO) {
		return -ENXIO;
	}

	girq = &mpfs_gpio->gc.irq;
	girq->num_parents = nirqs;

	if (girq->num_parents) {
		gpio_irq_chip_set_chip(girq, &mpfs_gpio_irqchip);
		girq->parent_handler = mpfs_gpio_irq_handler;
		girq->parent_handler_data = mpfs_gpio;

		girq->parents = devm_kcalloc(&pdev->dev, girq->num_parents,
					     sizeof(*girq->parents), GFP_KERNEL);

		if (!girq->parents) {
			return -ENOMEM;
		}

		for (int i = 0; i < girq->num_parents; i++) {
			ret = platform_get_irq(pdev, i);
			if (ret < 0)
				return ret;

			girq->parents[i] = ret;
		}

		girq->handler = handle_simple_irq;
		girq->default_type = IRQ_TYPE_NONE;
	}

	return devm_gpiochip_add_data(dev, &mpfs_gpio->gc, mpfs_gpio);
}

static const struct mpfs_gpio_reg_offsets mpfs_reg_offsets = {
	.inp = MPFS_INP_REG,
	.outp = MPFS_OUTP_REG,
};

static const struct mpfs_gpio_reg_offsets coregpio_reg_offsets = {
	.inp = COREGPIO_INP_REG,
	.outp = COREGPIO_OUTP_REG,
};

static const struct of_device_id mpfs_gpio_of_ids[] = {
	{
		.compatible = "microchip,mpfs-gpio",
		.data = &mpfs_reg_offsets,
	}, {
		.compatible = "microchip,coregpio-rtl-v3",
		.data = &coregpio_reg_offsets,
	},
	{ /* end of list */ }
};

static struct platform_driver mpfs_gpio_driver = {
	.probe = mpfs_gpio_probe,
	.driver = {
		.name = "microchip,mpfs-gpio",
		.of_match_table = mpfs_gpio_of_ids,
	},
};
builtin_platform_driver(mpfs_gpio_driver);
```

Since Inturrupts are not in the scope of this article, We'll mostly be focusing on other Important things. So I'll remove the inturrupt handling part from the code.

```c
// SPDX-License-Identifier: (GPL-2.0)
/*
 * Microchip PolarFire SoC (MPFS) GPIO controller driver
 *
 * Copyright (c) 2018-2024 Microchip Technology Inc. and its subsidiaries
 */

#include <linux/clk.h>
#include <linux/device.h>
#include <linux/errno.h>
#include <linux/gpio/driver.h>
#include <linux/init.h>
#include <linux/mod_devicetable.h>
#include <linux/platform_device.h>
#include <linux/property.h>
#include <linux/regmap.h>
#include <linux/spinlock.h>

#define MPFS_GPIO_CTRL(i)		(0x4 * (i))
#define MPFS_MAX_NUM_GPIO		32
#define MPFS_GPIO_EN_INT		BIT(3)
#define MPFS_GPIO_EN_OUT_BUF		BIT(2)
#define MPFS_GPIO_EN_IN			BIT(1)
#define MPFS_GPIO_EN_OUT		BIT(0)
#define MPFS_GPIO_DIR_MASK		GENMASK(2, 0)

#define MPFS_INP_REG			0x84
#define COREGPIO_INP_REG		0x90
#define MPFS_OUTP_REG			0x88
#define COREGPIO_OUTP_REG		0xA0

struct mpfs_gpio_reg_offsets {
	u8 inp;
	u8 outp;
};

struct mpfs_gpio_chip {
	struct regmap *regs;
	const struct mpfs_gpio_reg_offsets *offsets;
	struct gpio_chip gc;
};

static const struct regmap_config mpfs_gpio_regmap_config = {
	.reg_bits = 32,
	.reg_stride = 4,
	.val_bits = 32,
};

static int mpfs_gpio_direction_input(struct gpio_chip *gc, unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_IN);

	return 0;
}

static int mpfs_gpio_direction_output(struct gpio_chip *gc, unsigned int gpio_index, int value)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_OUT | MPFS_GPIO_EN_OUT_BUF);
	regmap_update_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp, BIT(gpio_index),
			   value << gpio_index);

	return 0;
}

static int mpfs_gpio_get_direction(struct gpio_chip *gc,
				   unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	unsigned int gpio_cfg;

	regmap_read(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index), &gpio_cfg);
	if (gpio_cfg & MPFS_GPIO_EN_IN)
		return GPIO_LINE_DIRECTION_IN;

	return GPIO_LINE_DIRECTION_OUT;
}

static int mpfs_gpio_get(struct gpio_chip *gc, unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	if (mpfs_gpio_get_direction(gc, gpio_index) == GPIO_LINE_DIRECTION_OUT)
		return regmap_test_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp, BIT(gpio_index));
	else
		return regmap_test_bits(mpfs_gpio->regs, mpfs_gpio->offsets->inp, BIT(gpio_index));
}

static int mpfs_gpio_set(struct gpio_chip *gc, unsigned int gpio_index, int value)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	int ret;

	mpfs_gpio_get(gc, gpio_index);

	ret = regmap_update_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp,
				 BIT(gpio_index), value << gpio_index);

	mpfs_gpio_get(gc, gpio_index);

	return ret;
}

static int mpfs_gpio_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct device_node *node = pdev->dev.of_node;
	struct mpfs_gpio_chip *mpfs_gpio;
	struct clk *clk;
	void __iomem *base;
	int ngpios;

	mpfs_gpio = devm_kzalloc(dev, sizeof(*mpfs_gpio), GFP_KERNEL);
	if (!mpfs_gpio)
		return -ENOMEM;

	mpfs_gpio->offsets = device_get_match_data(&pdev->dev);

	base = devm_platform_ioremap_resource(pdev, 0);
	if (IS_ERR(base))
		return dev_err_probe(dev, PTR_ERR(base), "failed to ioremap memory resource\n");

	mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);
	if (IS_ERR(mpfs_gpio->regs))
		return dev_err_probe(dev, PTR_ERR(mpfs_gpio->regs),
				     "failed to initialise regmap\n");

	clk = devm_clk_get_enabled(dev, NULL);
	if (IS_ERR(clk))
		return dev_err_probe(dev, PTR_ERR(clk), "failed to get and enable clock\n");

	ngpios = MPFS_MAX_NUM_GPIO;
	device_property_read_u32(dev, "ngpios", &ngpios);
	if (ngpios > MPFS_MAX_NUM_GPIO)
		ngpios = MPFS_MAX_NUM_GPIO;

	mpfs_gpio->gc.direction_input = mpfs_gpio_direction_input;
	mpfs_gpio->gc.direction_output = mpfs_gpio_direction_output;
	mpfs_gpio->gc.get_direction = mpfs_gpio_get_direction;
	mpfs_gpio->gc.get = mpfs_gpio_get;
	mpfs_gpio->gc.set = mpfs_gpio_set;
	mpfs_gpio->gc.base = -1;
	mpfs_gpio->gc.ngpio = ngpios;
	mpfs_gpio->gc.label = dev_name(dev);
	mpfs_gpio->gc.parent = dev;
	mpfs_gpio->gc.owner = THIS_MODULE;

	return devm_gpiochip_add_data(dev, &mpfs_gpio->gc, mpfs_gpio);
}

static const struct mpfs_gpio_reg_offsets mpfs_reg_offsets = {
	.inp = MPFS_INP_REG,
	.outp = MPFS_OUTP_REG,
};

static const struct mpfs_gpio_reg_offsets coregpio_reg_offsets = {
	.inp = COREGPIO_INP_REG,
	.outp = COREGPIO_OUTP_REG,
};

static const struct of_device_id mpfs_gpio_of_ids[] = {
	{
		.compatible = "microchip,mpfs-gpio",
		.data = &mpfs_reg_offsets,
	}, {
		.compatible = "microchip,coregpio-rtl-v3",
		.data = &coregpio_reg_offsets,
	},
	{ /* end of list */ }
};

static struct platform_driver mpfs_gpio_driver = {
	.probe = mpfs_gpio_probe,
	.driver = {
		.name = "microchip,mpfs-gpio",
		.of_match_table = mpfs_gpio_of_ids,
	},
};
builtin_platform_driver(mpfs_gpio_driver);
```
First of all this driver utilize the GPIO driver development utilities provided by linux. It provides all the things needed to communicate with the user space we just need to implement the hardware part. Let's start with the ```platform_driver``` first.
## Platform driver

Platform driver is a utility provided by linux. It will help us in the driver loading and getting the hardware properties found in the device tree. This is included by ```#include <linux/platform_device.h>```.
```c
static struct platform_driver mpfs_gpio_driver = {
	.probe = mpfs_gpio_probe,
	.driver = {
		.name = "microchip,mpfs-gpio",
		.of_match_table = mpfs_gpio_of_ids,
	},
};
builtin_platform_driver(mpfs_gpio_driver);
```

We have the platform device structure defined in ```platform_driver.h```.
```c
struct platform_driver {
    int (*probe)(struct platform_device *);   /* device found, bind driver */
    void (*remove)(struct platform_device *);  /* device removed, unbind */
    void (*shutdown)(struct platform_device *);
    int (*suspend)(struct platform_device *, pm_message_t state);
    int (*resume)(struct platform_device *);
    struct device_driver driver;              /* embedded generic driver */
    const struct platform_device_id *id_table; /* legacy ID matching */
    bool driver_managed_dma;
};
```
It describes a general driver. In this, the ```probe``` will hold the pointer to the function to call when the driver is loading. There are other similiar self explanatory function pointers. The next important thing is ```driver``` property which is a ```struct device_driver``` defined in ```include/linux/device/driver.h```. It is defined as:

```c
struct device_driver {
	const char		*name;
	const struct bus_type	*bus;

	struct module		*owner;
	const char		*mod_name;	/* used for built-in modules */

	bool suppress_bind_attrs;	/* disables bind/unbind via sysfs */
	enum probe_type probe_type;

	const struct of_device_id	*of_match_table;
	const struct acpi_device_id	*acpi_match_table;

	int (*probe) (struct device *dev);
	void (*sync_state)(struct device *dev);
	int (*remove) (struct device *dev);
	void (*shutdown) (struct device *dev);
	int (*suspend) (struct device *dev, pm_message_t state);
	int (*resume) (struct device *dev);
	const struct attribute_group *const *groups;
	const struct attribute_group *const *dev_groups;

	const struct dev_pm_ops *pm;
	void (*coredump) (struct device *dev);

	struct driver_private *p;
	struct {
		/*
		 * Called after remove() but before devres entries are released.
		 * This is a Rust only callback.
		 */
		void (*post_unbind_rust)(struct device *dev);
	} p_cb;
};
```

I know this is a lot. We are currently intrested in the ```const char * name``` which is just the compatable string defined in the device tree, ```struct module owner``` which is the module that this driver is implemented. and the ```struct of_device_id	*of_match_table```. This is just an array of type ```struct of_device_id```. That is defined in:

```c
/*
 * Struct used for matching a device
 */
struct of_device_id {
	char	name[32];
	char	type[32];
	char	compatible[128];
	const void *data;
};
```
The ```name``` is the name of node to match and ```compatible``` is the compatablity string and ```data``` is a void pointer which is passed to other driver functions as data. Finally the ```builtin_platform_driver(mpfs_gpio_driver);``` function registers the driver to the linux driver loading susbsystem.

Now we get a clear image of what is happening with this code.

```c
struct mpfs_gpio_reg_offsets {
	u8 inp;
	u8 outp;
};

...


static const struct mpfs_gpio_reg_offsets mpfs_reg_offsets = {
	.inp = MPFS_INP_REG,
	.outp = MPFS_OUTP_REG,
};

static const struct mpfs_gpio_reg_offsets coregpio_reg_offsets = {
	.inp = COREGPIO_INP_REG,
	.outp = COREGPIO_OUTP_REG,
};

static const struct of_device_id mpfs_gpio_of_ids[] = {
	{
		.compatible = "microchip,mpfs-gpio",
		.data = &mpfs_reg_offsets,
	}, {
		.compatible = "microchip,coregpio-rtl-v3",
		.data = &coregpio_reg_offsets,
	},
	{ /* end of list */ }
};

static struct platform_driver mpfs_gpio_driver = {
	.probe = mpfs_gpio_probe,
	.driver = {
		.name = "microchip,mpfs-gpio",
		.of_match_table = mpfs_gpio_of_ids,
	},
};
builtin_platform_driver(mpfs_gpio_driver);
```

- First we'll fill the datas needed for each device as we like and make an array of ```of_device_id```, fill it with the compatablity string and data.
- Next we create the ```platform_driver``` struct and fill it with our probe function, compatablity string and match table we created.
- Finaly we register the platform_driver we created with ```builtin_platform_driver()``` function.

Now any time the linux see the compatablity string in it's device tree, he will associate that node to this driver and call the probe function. All the parameters will be provided to the function from the device tree making our lifes way easier.

[Here you can read more](https://kernel-internals.org/drivers/platform-driver/)

## The gpio_chip struct
```c
struct mpfs_gpio_chip {
	struct regmap *regs;
	const struct mpfs_gpio_reg_offsets *offsets;
	struct gpio_chip gc;
};
```

Here we can see a ```gpio_chip``` struct is used to represent our gpio controller. This is provided by linux in ```linux/gpio/driver.h```. We are going to fill the implemetation of all gpio related variables and function to this struct and add it as a GPIO. Rest will be handled by linux.

## The probe function
After registering, we'll get the probe callback when the driver have to load. The probe function is:
```c
static int mpfs_gpio_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct device_node *node = pdev->dev.of_node;
	struct mpfs_gpio_chip *mpfs_gpio;
	struct clk *clk;
	void __iomem *base;
	int ngpios;

	mpfs_gpio = devm_kzalloc(dev, sizeof(*mpfs_gpio), GFP_KERNEL);
	if (!mpfs_gpio)
		return -ENOMEM;

	mpfs_gpio->offsets = device_get_match_data(&pdev->dev);

	base = devm_platform_ioremap_resource(pdev, 0);
	if (IS_ERR(base))
		return dev_err_probe(dev, PTR_ERR(base), "failed to ioremap memory resource\n");

	mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);
	if (IS_ERR(mpfs_gpio->regs))
		return dev_err_probe(dev, PTR_ERR(mpfs_gpio->regs),
				     "failed to initialise regmap\n");

	clk = devm_clk_get_enabled(dev, NULL);
	if (IS_ERR(clk))
		return dev_err_probe(dev, PTR_ERR(clk), "failed to get and enable clock\n");

	ngpios = MPFS_MAX_NUM_GPIO;
	device_property_read_u32(dev, "ngpios", &ngpios);
	if (ngpios > MPFS_MAX_NUM_GPIO)
		ngpios = MPFS_MAX_NUM_GPIO;

	mpfs_gpio->gc.direction_input = mpfs_gpio_direction_input;
	mpfs_gpio->gc.direction_output = mpfs_gpio_direction_output;
	mpfs_gpio->gc.get_direction = mpfs_gpio_get_direction;
	mpfs_gpio->gc.get = mpfs_gpio_get;
	mpfs_gpio->gc.set = mpfs_gpio_set;
	mpfs_gpio->gc.base = -1;
	mpfs_gpio->gc.ngpio = ngpios;
	mpfs_gpio->gc.label = dev_name(dev);
	mpfs_gpio->gc.parent = dev;
	mpfs_gpio->gc.owner = THIS_MODULE;

	return devm_gpiochip_add_data(dev, &mpfs_gpio->gc, mpfs_gpio);
}
```
First thing, the platform device API provides a ```platform_device``` struct which defines as:
```c
struct platform_device {
	const char	*name;
	int		id;
	bool		id_auto;
	struct device	dev;
	u64		platform_dma_mask;
	struct device_dma_parameters dma_parms;
	u32		num_resources;
	struct resource	*resource;

	const struct platform_device_id	*id_entry;

	/* MFD cell pointer */
	struct mfd_cell *mfd_cell;

	/* arch specific additions */
	struct pdev_archdata	archdata;
};
```
When passing into the probe function, all the parameters are filled.
- ```name``` is the compatablity string.
- ```device``` is the associated device we can use to take the tree node.

```c
    struct device *dev = &pdev->dev;
	struct device_node *node = pdev->dev.of_node;
	struct mpfs_gpio_chip *mpfs_gpio;
	struct clk *clk;
	void __iomem *base;
	int ngpios;
```
Here we will take out the device and device node from the *pdev provided by the platform device. And we'll define our custom struct holding the ```gpio_chip``` for linux and register maps for us.  More about the clock later. ```base``` is a void pointer we use to hold the mapped virtual memory representing the physical space of register. ```ngpios``` hold the number of gpios in a chip.

```c
	mpfs_gpio = devm_kzalloc(dev, sizeof(*mpfs_gpio), GFP_KERNEL);
	if (!mpfs_gpio)
		return -ENOMEM;
```
Here we are allocating the memory needed to hold the mpfs_gpio struct. We are passing the device to this function so that the memory will be associated to that specific drivers. The GPIO subsystem will automatically free this. Don't worry.
```c
base = devm_platform_ioremap_resource(pdev, 0);
```
Here ```devm_platform_ioremap_resource``` function will allocate the IO mapped virtual memory defined by device tree at the index 0.

```c
	mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);
	if (IS_ERR(mpfs_gpio->regs))
		return dev_err_probe(dev, PTR_ERR(mpfs_gpio->regs),
				     "failed to initialise regmap\n");

	clk = devm_clk_get_enabled(dev, NULL);
	if (IS_ERR(clk))
		return dev_err_probe(dev, PTR_ERR(clk), "failed to get and enable clock\n");
```
This is the part where we initialize the clock and regmap API. more about them later.

```c
	ngpios = MPFS_MAX_NUM_GPIO;
	device_property_read_u32(dev, "ngpios", &ngpios);
	if (ngpios > MPFS_MAX_NUM_GPIO)
		ngpios = MPFS_MAX_NUM_GPIO;
```
Here we will read the ```"ngpios"``` property from device tree node and clamp it to a maximum.

```c
	mpfs_gpio->gc.direction_input = mpfs_gpio_direction_input;
	mpfs_gpio->gc.direction_output = mpfs_gpio_direction_output;
	mpfs_gpio->gc.get_direction = mpfs_gpio_get_direction;
	mpfs_gpio->gc.get = mpfs_gpio_get;
	mpfs_gpio->gc.set = mpfs_gpio_set;
	mpfs_gpio->gc.base = -1;
	mpfs_gpio->gc.ngpio = ngpios;
	mpfs_gpio->gc.label = dev_name(dev);
	mpfs_gpio->gc.parent = dev;
	mpfs_gpio->gc.owner = THIS_MODULE;

	return devm_gpiochip_add_data(dev, &mpfs_gpio->gc, mpfs_gpio);
```
Finally we will fill out all the gpio action functions, variables to the gpio_chip struct of our custom structure. After that we'll pass the device reference, the gpio_chip structure, and our custom structure for destruction to ```devm_gpiochip_add_data``` function which will initialize the gpio subsystem.

## The regmap API
```c
#include <linux/regmap.h>

...

static const struct regmap_config mpfs_gpio_regmap_config = {
	.reg_bits = 32,
	.reg_stride = 4,
	.val_bits = 32,
};

...

	mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);

...
```

This is a utility provided by linux for managing the access to the physical memory mapped registers. This supports I2C, SPI and memory mapped I/O register accessing. This API provides functions for setting and reading bits from a register. For initializing a regmap, we use the function:
```c
mpfs_gpio->regs = devm_regmap_init_mmio(dev, base, &mpfs_gpio_regmap_config);
```
we pass the device reference for managing the memory size and lifecycle, the base register address and a ```regmap_config``` structure. This holds the configuration for the register map.

Another functions of this API used in this driver:
- ```regmap_update_bits```
- ```regmap_read```
- ```regmap_test_bits```

## The clk API
This API is provided by the linux which is used to manage the clock to a device. Normally a peripleral clock will be gated in the ```SUBB_CLK_CR```. We can use this API to initialize the clock. When we pass the device reference, it will look into the device tree and find out the clock needed for that and initialize it.
```c
	clk = devm_clk_get_enabled(dev, NULL);
	if (IS_ERR(clk))
		return dev_err_probe(dev, PTR_ERR(clk), "failed to get and enable clock\n");
```

## Defenitions

```c
#define MPFS_GPIO_CTRL(i)		(0x4 * (i))
#define MPFS_MAX_NUM_GPIO		32
#define MPFS_GPIO_EN_INT		BIT(3)
#define MPFS_GPIO_EN_OUT_BUF		BIT(2)
#define MPFS_GPIO_EN_IN			BIT(1)
#define MPFS_GPIO_EN_OUT		BIT(0)
#define MPFS_GPIO_DIR_MASK		GENMASK(2, 0)

#define MPFS_INP_REG			0x84
#define COREGPIO_INP_REG		0x90
#define MPFS_OUTP_REG			0x88
#define COREGPIO_OUTP_REG		0xA0
```
This part is actually the device specific things. 
- ```MPFS_GPIO_CTRL(i)``` : In pic64gx1000 first 32 registers with 32 bits each are the cinfig registers. So we can add 4 to the base iteratively to find out the address. This macro will take care of that.
- ```MPFS_MAX_NUM_GPIO``` : The maximum number of GPIO pins available in a bank.
- ```c
    #define MPFS_GPIO_EN_INT		BIT(3)
    #define MPFS_GPIO_EN_OUT_BUF		BIT(2)
    #define MPFS_GPIO_EN_IN			BIT(1)
    #define MPFS_GPIO_EN_OUT		BIT(0)
  ```
  This is the but positions of each config bits.
- ```MPFS_INP_REG``` : Input register to read
- ```MPFS_OUTP_REG``` : Output register to read and write

## Set direction input/output function
```c
static int mpfs_gpio_direction_input(struct gpio_chip *gc, unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_IN);

	return 0;
}
```
This function will be called when the subsystem wants to set the direction as input. We'll get a reference to which gpio chip and at what index. 
```gpiochip_get_data``` function will return our custom gpio struct. We can take back the reference to the register map we inited.
The ```regmap_update_bits``` function will take the reference to the register map, the register address, the mask for that register and the value as in it it 1 and others are 0.

The same thing goes for the set direction output function
```c
static int mpfs_gpio_direction_output(struct gpio_chip *gc, unsigned int gpio_index, int value)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);

	regmap_update_bits(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index),
			   MPFS_GPIO_DIR_MASK, MPFS_GPIO_EN_OUT | MPFS_GPIO_EN_OUT_BUF);
	regmap_update_bits(mpfs_gpio->regs, mpfs_gpio->offsets->outp, BIT(gpio_index),
			   value << gpio_index);

	return 0;
}
```
The additions are they also enabled the output buffer and we also gets an initial value. so right after we setup the GPIO as output we also sets the value of the output. Here we use the data we gave while initializing the driver. we get the output address. And we make that bit only one as a mask and set that value to the register.

## Get direction function

```c
static int mpfs_gpio_get_direction(struct gpio_chip *gc,
				   unsigned int gpio_index)
{
	struct mpfs_gpio_chip *mpfs_gpio = gpiochip_get_data(gc);
	unsigned int gpio_cfg;

	regmap_read(mpfs_gpio->regs, MPFS_GPIO_CTRL(gpio_index), &gpio_cfg);
	if (gpio_cfg & MPFS_GPIO_EN_IN)
		return GPIO_LINE_DIRECTION_IN;

	return GPIO_LINE_DIRECTION_OUT;
}
```
Here we use ```regmap_read``` function to read the whole value of a register to an integer pointer. Then we compare it with ```MPFS_GPIO_EN_IN``` and if true return the DIRECTION_IN defined in the GPIO subsystem. else return DIRECTION_OUT.
