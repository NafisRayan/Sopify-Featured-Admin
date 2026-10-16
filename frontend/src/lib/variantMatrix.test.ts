import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateCartesianVariants,
  generateBulkSkus,
  type ProductOptionDef,
  type ProductVariantItem,
} from './variantMatrix'

test('Cartesian variant generation: Size (2) x Color (2) = 4 variants', () => {
  const options: ProductOptionDef[] = [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Color', values: ['Red', 'Blue'] },
  ]

  const variants = generateCartesianVariants(options, [], 40.0)
  assert.equal(variants.length, 4)

  const titles = variants.map((v) => v.title)
  assert.deepEqual(titles, ['S / Red', 'S / Blue', 'M / Red', 'M / Blue'])

  // Verify all have default price
  assert.equal(variants[0].price, 40.0)
  assert.equal(variants[0].optionValues.Size, 'S')
  assert.equal(variants[0].optionValues.Color, 'Red')
})

test('Option updates preserve existing prices, SKUs, and inventory', () => {
  const initialOptions: ProductOptionDef[] = [
    { name: 'Size', values: ['S', 'M'] },
  ]

  const existing: ProductVariantItem[] = [
    {
      id: 'v_s',
      title: 'S',
      price: 35.0,
      sku: 'HOODIE-S',
      inventoryQuantity: 25,
      optionValues: { Size: 'S' },
    },
    {
      id: 'v_m',
      title: 'M',
      price: 45.0,
      sku: 'HOODIE-M',
      inventoryQuantity: 50,
      optionValues: { Size: 'M' },
    },
  ]

  // Add new option value 'L'
  const updatedOptions: ProductOptionDef[] = [
    { name: 'Size', values: ['S', 'M', 'L'] },
  ]

  const nextVariants = generateCartesianVariants(updatedOptions, existing, 30.0)
  assert.equal(nextVariants.length, 3)

  // Verify existing S and M preserved their properties
  const sVar = nextVariants.find((v) => v.title === 'S')
  assert.ok(sVar)
  assert.equal(sVar.price, 35.0)
  assert.equal(sVar.sku, 'HOODIE-S')
  assert.equal(sVar.inventoryQuantity, 25)

  const mVar = nextVariants.find((v) => v.title === 'M')
  assert.ok(mVar)
  assert.equal(mVar.price, 45.0)
  assert.equal(mVar.sku, 'HOODIE-M')
  assert.equal(mVar.inventoryQuantity, 50)

  // Verify new L variant got default price
  const lVar = nextVariants.find((v) => v.title === 'L')
  assert.ok(lVar)
  assert.equal(lVar.price, 30.0)
})

test('Bulk SKU generation assigns deterministic handles', () => {
  const options: ProductOptionDef[] = [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Color', values: ['Black'] },
  ]

  const variants = generateCartesianVariants(options)
  const withSkus = generateBulkSkus(variants, 'parka')

  assert.equal(withSkus[0].sku, 'PARKA-S-BLAC')
  assert.equal(withSkus[1].sku, 'PARKA-M-BLAC')
})
