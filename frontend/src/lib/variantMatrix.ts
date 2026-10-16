export interface ProductOptionDef {
  name: string
  values: string[]
}

export interface ProductVariantItem {
  id?: string
  title: string
  sku?: string
  barcode?: string
  price: number
  compareAtPrice?: number
  costPerItem?: number
  inventoryQuantity?: number
  optionValues: Record<string, string>
  imageId?: string
  imageSrc?: string
  available?: boolean
}

/**
 * Computes all Cartesian product combinations of option values ($N_1 \times N_2 \times N_3$)
 * while preserving existing prices, SKUs, barcodes, and inventory quantities.
 */
export function generateCartesianVariants(
  options: ProductOptionDef[],
  existingVariants: ProductVariantItem[] = [],
  defaultPrice = 0,
): ProductVariantItem[] {
  const activeOptions = options.filter((opt) => opt.name.trim() && opt.values.length > 0)
  if (activeOptions.length === 0) {
    // Single default variant
    const existingDefault = existingVariants.find(
      (v) => v.title === 'Default Title' || Object.keys(v.optionValues || {}).length === 0,
    )
    return [
      {
        id: existingDefault?.id || 'v_default_1',
        title: 'Default Title',
        price: existingDefault?.price ?? defaultPrice,
        compareAtPrice: (existingDefault?.compareAtPrice ?? undefined) as number | undefined,
        costPerItem: (existingDefault?.costPerItem ?? undefined) as number | undefined,
        sku: existingDefault?.sku ?? '',
        barcode: existingDefault?.barcode ?? '',
        inventoryQuantity: existingDefault?.inventoryQuantity ?? 0,
        optionValues: {},
        imageId: (existingDefault?.imageId ?? undefined) as string | undefined,
        imageSrc: (existingDefault?.imageSrc ?? undefined) as string | undefined,
        available: true,
      },
    ]
  }

  // Cartesian product calculation
  let combinations: Array<Record<string, string>> = [{}]
  for (const opt of activeOptions) {
    const nextCombos: Array<Record<string, string>> = []
    for (const combo of combinations) {
      for (const val of opt.values) {
        nextCombos.push({ ...combo, [opt.name]: val })
      }
    }
    combinations = nextCombos
  }

  // Map to variant items, looking up existing variant for property preservation
  return combinations.map((optValues, idx) => {
    const titleParts = activeOptions.map((opt) => optValues[opt.name] || '')
    const title = titleParts.join(' / ')

    const matched = existingVariants.find((existing) => {
      // 1. Check matching option values
      const existingOpts = existing.optionValues || {}
      const allMatch = activeOptions.every((opt) => existingOpts[opt.name] === optValues[opt.name])
      if (allMatch && Object.keys(existingOpts).length === activeOptions.length) return true
      // 2. Check title match
      return existing.title === title
    })

    return {
      id: matched?.id || `v_matrix_${idx + 1}_${Date.now()}`,
      title,
      price: matched?.price ?? defaultPrice,
      compareAtPrice: (matched?.compareAtPrice ?? undefined) as number | undefined,
      costPerItem: (matched?.costPerItem ?? undefined) as number | undefined,
      sku: matched?.sku ?? '',
      barcode: matched?.barcode ?? '',
      inventoryQuantity: matched?.inventoryQuantity ?? 0,
      optionValues: optValues,
      imageId: (matched?.imageId ?? undefined) as string | undefined,
      imageSrc: (matched?.imageSrc ?? undefined) as string | undefined,
      available: matched?.available ?? true,
    }
  })
}

/**
 * Bulk generates deterministic SKUs using a clean template e.g. {HANDLE}-{SIZE}-{COLOR}
 */
export function generateBulkSkus(
  variants: ProductVariantItem[],
  productHandle = 'PROD',
): ProductVariantItem[] {
  const sanitizedHandle = productHandle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM'
  return variants.map((v) => {
    const optValuesPart = Object.values(v.optionValues || {})
      .map((val) => val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
      .filter(Boolean)
      .join('-')

    const sku = optValuesPart ? `${sanitizedHandle}-${optValuesPart}` : `${sanitizedHandle}-DEF`
    return { ...v, sku }
  })
}
