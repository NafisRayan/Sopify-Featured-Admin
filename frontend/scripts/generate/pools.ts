// Shared data pools for the seed generator. Believable ecommerce data.

export const STORE_NAME = 'Northstar Goods'

export const FIRST_NAMES = [
  'Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Ruby', 'Lucas', 'Isla', 'Owen',
  'Nina', 'Felix', 'Clara', 'Henry', 'Lena', 'Jack', 'Iris', 'Milo', 'Sadie', 'Leo',
  'Grace', 'Oscar', 'Freya', 'Jonah', 'Elsie', 'Rhys', 'Nora', 'Theo', 'June', 'Cole',
  'Wren', 'Silas', 'Daisy', 'Amos', 'Tessa', 'Rowan', 'Priya', 'Diego', 'Amara', 'Kenji',
  'Sofia', 'Marcus', 'Hana', 'Andre', 'Yuki', 'Tariq', 'Elena', 'Omar', 'Freya', 'Ravi',
  'Chloe', 'Dmitri', 'Aisha', 'Paulo', 'Mei', 'Jonas', 'Leila', 'Arjun', 'Ingrid', 'Mateo',
]

export const LAST_NAMES = [
  'Bennett', 'Okafor', 'Ramirez', 'Kimura', 'Novak', 'Delgado', 'Fitzgerald', 'Haddad',
  'Lindqvist', 'Moreau', 'Tanaka', 'Osei', 'Petrov', 'Silva', 'Nakamura', 'Kowalski',
  'Ibrahim', 'Castellano', 'Nguyen', 'Sorensen', 'Adeyemi', 'Rossi', 'Larsen', 'Mendoza',
  'Chatterjee', 'Dubois', 'Yilmaz', 'Andersen', 'Baptiste', 'Kaur', 'Eriksen', 'Vasquez',
  'Osei-Bonsu', 'Fontaine', 'Marino', 'Suzuki', 'Aldana', 'Bergström', 'Costa', 'Reyes',
]

export const CITIES: { city: string; province: string; country: string; zip: string }[] = [
  { city: 'Portland', province: 'OR', country: 'United States', zip: '97201' },
  { city: 'Austin', province: 'TX', country: 'United States', zip: '73301' },
  { city: 'Brooklyn', province: 'NY', country: 'United States', zip: '11201' },
  { city: 'Denver', province: 'CO', country: 'United States', zip: '80202' },
  { city: 'Seattle', province: 'WA', country: 'United States', zip: '98101' },
  { city: 'Chicago', province: 'IL', country: 'United States', zip: '60601' },
  { city: 'Nashville', province: 'TN', country: 'United States', zip: '37201' },
  { city: 'Boulder', province: 'CO', country: 'United States', zip: '80302' },
  { city: 'Savannah', province: 'GA', country: 'United States', zip: '31401' },
  { city: 'Minneapolis', province: 'MN', country: 'United States', zip: '55401' },
  { city: 'Toronto', province: 'ON', country: 'Canada', zip: 'M5V 2H1' },
  { city: 'Vancouver', province: 'BC', country: 'Canada', zip: 'V6B 1A1' },
  { city: 'London', province: 'Greater London', country: 'United Kingdom', zip: 'EC1A 1BB' },
  { city: 'Melbourne', province: 'VIC', country: 'Australia', zip: '3000' },
  { city: 'Berlin', province: 'Berlin', country: 'Germany', zip: '10115' },
]

export const STREETS = [
  'Alder St', 'Birchwood Ave', 'Cedar Ln', 'Dogwood Dr', 'Elm Ct', 'Fir St',
  'Grove St', 'Hazelwood Ave', 'Juniper Way', 'Kestrel Rd', 'Laurel St', 'Maple Ave',
  'Noble Ct', 'Oakmont Dr', 'Pine Hollow Rd', 'Quarry St', 'Ridgeway Ave', 'Spruce Ln',
]

// Product catalog: families × styles. `variants` describes option axes.
export interface FamilyDef {
  slug: string
  title: string
  type: string
  vendor: string
  category: string
  price: number
  compareAt?: number
  cost: number
  weight: number
  tags: string[]
  colors?: string[]
  sizes?: string[]
  colorCount?: number
  description: string
  /** Digital products ship nothing and track no stock (variant rows mirror these). */
  requiresShipping?: boolean
  trackQuantity?: boolean
}

export const VENDORS = ['Northstar Goods', 'Alder & Oak', 'Trailhead Supply', 'Hearthstone', 'Meridian Basics']

export const FAMILIES: FamilyDef[] = [
  {
    slug: 'classic-cotton-t-shirt', title: 'Classic Cotton T-Shirt', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing > Shirts', price: 24, compareAt: 32, cost: 8, weight: 180,
    tags: ['essential', 'cotton', 'unisex'], colors: ['Black', 'White', 'Navy', 'Blue', 'Olive'], sizes: ['S', 'M', 'L', 'XL'],
    description:
      '<p>Our bestselling everyday tee, cut from 220gsm organic cotton with a relaxed fit that holds its shape wash after wash. Pre-shrunk, garment-dyed, and finished with a ribbed collar.</p><ul><li>100% organic cotton</li><li>Relaxed unisex fit</li><li>Machine washable</li></ul>',
  },
  {
    slug: 'everyday-hoodie', title: 'Everyday Hoodie', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing > Hoodies', price: 54, compareAt: 68, cost: 19, weight: 520,
    tags: ['essential', 'fleece', 'unisex'], colors: ['Charcoal', 'Oatmeal', 'Forest', 'Dusty Rose'], sizes: ['S', 'M', 'L', 'XL'],
    description:
      '<p>A midweight brushed-fleece hoodie with a double-lined hood and hidden interior pocket. Runs true to size with a slightly boxy silhouette.</p><ul><li>80% cotton / 20% recycled poly</li><li>Kangaroo pocket</li><li>Reinforced side gussets</li></ul>',
  },
  {
    slug: 'canvas-backpack', title: 'Canvas Backpack', type: 'Bags', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Luggage > Backpacks', price: 68, cost: 24, weight: 890,
    tags: ['travel', 'canvas', 'bestseller'], colors: ['Field Green', 'Charcoal', 'Tan'],
    description:
      '<p>A 22L waxed-canvas daypack with a padded 15" laptop sleeve, brass hardware, and a roll-top closure that expands when you need it.</p><ul><li>Waxed 18oz canvas</li><li>Padded laptop sleeve</li><li>Water-resistant base</li></ul>',
  },
  {
    slug: 'minimal-sneakers', title: 'Minimal Sneakers', type: 'Footwear', vendor: 'Alder & Oak',
    category: 'Apparel & Accessories > Shoes', price: 89, compareAt: 110, cost: 31, weight: 740,
    tags: ['footwear', 'leather'], colors: ['White', 'Slate', 'Sand'], sizes: ['7', '8', '9', '10', '11'],
    description:
      '<p>Clean-lined low-top sneakers in full-grain leather with a cushioned cork insole and natural rubber cupsole. Unlined heel for easy break-in.</p>',
  },
  {
    slug: 'ceramic-coffee-mug', title: 'Ceramic Coffee Mug', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Drinkware', price: 18, cost: 6, weight: 380,
    tags: ['kitchen', 'ceramic', 'gift'], colors: ['Cream', 'Ink Blue', 'Sage', 'Clay'],
    description:
      '<p>Hand-glazed stoneware mug with a comfortable thumb rest and a 12oz capacity. Dishwasher and microwave safe; slight glaze variation makes each one unique.</p>',
  },
  {
    slug: 'leather-wallet', title: 'Leather Bifold Wallet', type: 'Accessories', vendor: 'Alder & Oak',
    category: 'Apparel & Accessories > Wallets', price: 42, cost: 14, weight: 90,
    tags: ['accessories', 'leather', 'gift'], colors: ['Chestnut', 'Black', 'Navy'],
    description:
      '<p>Six-card bifold cut from vegetable-tanned leather that patinas beautifully. Slim 9mm profile with a reinforced center pocket.</p>',
  },
  {
    slug: 'oversized-shirt', title: 'Oversized Linen Shirt', type: 'Apparel', vendor: 'Alder & Oak',
    category: 'Apparel & Accessories > Clothing > Shirts', price: 58, cost: 20, weight: 240,
    tags: ['linen', 'summer', 'unisex'], colors: ['White', 'Sky', 'Terracotta'], sizes: ['XS/S', 'M/L', 'XL/2XL'],
    description:
      '<p>Breezy washed-linen shirt with a camp collar and boxy fit. Garment-washed for softness; wears well tucked or loose.</p>',
  },
  {
    slug: 'running-cap', title: 'Running Cap', type: 'Accessories', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Clothing Accessories > Hats', price: 28, cost: 9, weight: 80,
    tags: ['sport', 'accessories'], colors: ['Black', 'Highlight Yellow', 'Storm Blue'],
    description:
      '<p>Lightweight five-panel running cap with laser-cut vents, a sweat-wicking band, and reflective heel tabs for low-light visibility.</p>',
  },
  {
    slug: 'yoga-mat', title: 'Pro Yoga Mat 6mm', type: 'Fitness', vendor: 'Northstar Goods',
    category: 'Sporting Goods > Exercise & Fitness > Yoga', price: 48, cost: 17, weight: 1100,
    tags: ['fitness', 'bestseller'], colors: ['Moss', 'Graphite', 'Blush'],
    description:
      '<p>6mm natural-rubber mat with an alignment-guiding texture and a non-slip moisture-wicking surface. Includes carry strap.</p>',
  },
  {
    slug: 'insulated-water-bottle', title: 'Insulated Water Bottle 750ml', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Sporting Goods > Outdoor > Hydration', price: 32, compareAt: 40, cost: 11, weight: 420,
    tags: ['outdoor', 'bestseller', 'gift'], colors: ['Brushed Steel', 'Matte Black', 'Juniper', 'Sandstone'],
    description:
      '<p>Double-walled 18/8 stainless bottle that keeps drinks cold 24h or hot 12h. Powder-coated grip finish, leakproof twist cap.</p>',
  },
  {
    slug: 'desk-organizer', title: 'Walnut Desk Organizer', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Decor > Desk Accessories', price: 46, cost: 16, weight: 750,
    tags: ['office', 'wood', 'gift'],
    description:
      '<p>Solid-walnut desktop tray with a phone stand, pen channel, and two felt-lined compartments. Finished with food-safe hardwax oil.</p>',
  },
  {
    slug: 'wool-throw-blanket', title: 'Wool Throw Blanket', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Linens > Blankets', price: 78, compareAt: 95, cost: 28, weight: 1300,
    tags: ['home', 'wool', 'gift'], colors: ['Heather Grey', 'Mustard', 'Rust'],
    description:
      '<p>Loom-woven merino throw with hand-twisted fringe. Warm, breathable, and generously sized at 130 × 180cm.</p>',
  },
  {
    slug: 'soy-candle-set', title: 'Soy Candle Trio', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Decor > Home Fragrance', price: 38, cost: 12, weight: 900,
    tags: ['home', 'gift', 'bestseller'],
    description:
      '<p>Three 6oz soy-wax candles: Cedar & Smoke, Fig & Sea Salt, and Golden Hour. 30-hour burn time each, cotton wicks, reusable glass.</p>',
  },
  {
    slug: 'linen-notebook', title: 'Linen-Bound Notebook', type: 'Stationery', vendor: 'Northstar Goods',
    category: 'Office & School Supplies > Paper > Notebooks', price: 16, cost: 5, weight: 260,
    tags: ['stationery', 'gift'], colors: ['Slate', 'Rust', 'Sage'],
    description:
      '<p>192 pages of 120gsm dot-grid paper in a linen hardcover with lay-flat binding and an elastic closure.</p>',
  },
  {
    slug: 'canvas-tote', title: 'Heavy Canvas Tote', type: 'Bags', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Luggage > Totes', price: 26, cost: 8, weight: 340,
    tags: ['essential', 'canvas'], colors: ['Natural', 'Navy', 'Black'],
    description:
      '<p>16oz canvas tote with an interior zip pocket and reinforced webbing handles rated to 40lbs. Screen-printed Northstar mark.</p>',
  },
  {
    slug: 'merino-beanie', title: 'Merino Beanie', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing Accessories > Hats', price: 30, cost: 10, weight: 100,
    tags: ['winter', 'wool'], colors: ['Charcoal', 'Oat', 'Ink Blue', 'Rust'],
    description: '<p>Double-layer merino rib knit that fits without squeezing. Tagless, machine washable.</p>',
  },
  {
    slug: 'trail-socks', title: 'Trail Socks 3-Pack', type: 'Apparel', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Clothing Accessories > Socks', price: 24, cost: 8, weight: 190,
    tags: ['outdoor', 'wool'],
    description: '<p>Cushioned merino-blend hiking socks with arch support and seamless toes. Three colorways per pack.</p>',
  },
  {
    slug: 'french-press', title: 'Stoneware French Press', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Coffee', price: 52, cost: 18, weight: 1200,
    tags: ['kitchen', 'coffee'],
    description: '<p>34oz stoneware press with a double steel filter that keeps grit out of your cup. Dishwasher-safe carafe.</p>',
  },
  {
    slug: 'serving-board', title: 'Oak Serving Board', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Serveware', price: 36, cost: 12, weight: 850,
    tags: ['kitchen', 'wood', 'gift'],
    description: '<p>Edge-grain white oak board with an angled handle and juice groove. Hand-finished with food-safe oil and beeswax.</p>',
  },
  {
    slug: 'desk-lamp', title: 'Brass Task Lamp', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Lighting > Lamps', price: 92, cost: 34, weight: 1600,
    tags: ['office', 'lighting'], colors: ['Aged Brass', 'Matte Black'],
    description: '<p>Adjustable brass task lamp with a weighted base, inline dimmer, and warm 2700K LED included.</p>',
  },
  {
    slug: 'field-journal', title: 'Waterproof Field Journal', type: 'Stationery', vendor: 'Trailhead Supply',
    category: 'Office & School Supplies > Paper > Notebooks', price: 22, cost: 7, weight: 210,
    tags: ['outdoor', 'stationery'], colors: ['Olive', 'Tan', 'Black'],
    description: '<p>48 pages of all-weather paper in a sewn vinyl cover. Writes in rain, survives the pack.</p>',
  },
  {
    slug: 'passport-holder', title: 'Leather Passport Holder', type: 'Accessories', vendor: 'Alder & Oak',
    category: 'Apparel & Accessories > Luggage > Passport Covers', price: 34, cost: 11, weight: 95,
    tags: ['travel', 'leather', 'gift'], colors: ['Chestnut', 'Black'],
    description: '<p>Vegetable-tanned passport sleeve with two card slots and a ticket pocket. Ages into a rich patina.</p>',
  },
  {
    slug: 'woven-belt', title: 'Woven Canvas Belt', type: 'Accessories', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Belts', price: 29, cost: 9, weight: 130,
    tags: ['accessories', 'essential'], colors: ['Olive', 'Navy', 'Khaki'], sizes: ['S (30-33")', 'M (33-36")', 'L (36-39")'],
    description: '<p>Adjustable webbing belt with a low-profile anodized buckle. Trims to size without fraying.</p>',
  },
  {
    slug: 'picnic-blanket', title: 'Waterproof Picnic Blanket', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Sporting Goods > Outdoor > Camping', price: 44, cost: 15, weight: 980,
    tags: ['outdoor', 'family'], colors: ['Scratch Stripe', 'Juniper'],
    description: '<p>Acrylic-top blanket with a welded PEVA backing that wipes clean. Folds into a carry strap at 140 × 200cm.</p>',
  },
  {
    slug: 'hammock', title: 'Packable Hammock', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Sporting Goods > Outdoor > Camping', price: 58, compareAt: 72, cost: 20, weight: 620,
    tags: ['outdoor', 'bestseller'],
    description: '<p>Ripstop nylon hammock with tree-friendly slotted straps, rated to 400lbs, packs to the size of a water bottle.</p>',
  },
  {
    slug: 'plant-pot', title: 'Speckled Stoneware Planter', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Lawn & Garden > Pots', price: 28, cost: 9, weight: 1100,
    tags: ['home', 'ceramic'], colors: ['Cream', 'Ink Blue'],
    description: '<p>Hand-thrown planter with a drainage hole and matching saucer. 6" diameter fits most shelf plants.</p>',
  },
  {
    slug: 'keychain-tool', title: 'Titanium Keychain Tool', type: 'Accessories', vendor: 'Trailhead Supply',
    category: 'Tools & Home Improvement > Hardware', price: 24, cost: 8, weight: 30,
    tags: ['everyday-carry', 'gift'],
    description: '<p>Bottle opener, box cutter, and flathead in a 12g titanium body with a lanyard hole.</p>',
  },
  {
    slug: 'phone-sling', title: 'Everyday Phone Sling', type: 'Bags', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Luggage > Waist Packs', price: 38, cost: 13, weight: 180,
    tags: ['travel', 'essential'], colors: ['Black', 'Field Green', 'Tan'],
    description: '<p>Minimal crossbody sling sized for a large phone, cards, and keys. Weatherproof zips, adjustable webbing.</p>',
  },
  {
    slug: 'matcha-whisk-set', title: 'Matcha Whisk Set', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Tea', price: 34, cost: 12, weight: 320,
    tags: ['kitchen', 'gift'],
    description: '<p>Bamboo chasen whisk, ceramic whisk holder, and bamboo scoop in a gift-ready box.</p>',
  },
  {
    slug: 'shower-steamer-set', title: 'Shower Steamer Set', type: 'Home', vendor: 'Hearthstone',
    category: 'Health & Beauty > Personal Care > Bath', price: 22, cost: 7, weight: 420,
    tags: ['home', 'gift'],
    description: '<p>Six aromatherapy steamers: eucalyptus, lavender, and citrus. Effervesce on the shower floor, not in your eyes.</p>',
  },
  {
    slug: 'packable-rain-jacket', title: 'Packable Rain Jacket', type: 'Apparel', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Clothing > Outerwear', price: 98, compareAt: 128, cost: 34, weight: 380,
    tags: ['outdoor', 'rain', 'new-arrival'], colors: ['Storm Blue', 'Moss', 'Black'], sizes: ['S', 'M', 'L', 'XL'],
    description: '<p>2.5-layer waterproof shell that packs into its own chest pocket. Fully taped seams, 10k/10k rating.</p>',
  },
  {
    slug: 'carry-on-duffel', title: 'Carry-On Duffel 40L', type: 'Bags', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Luggage > Duffels', price: 84, cost: 29, weight: 1150,
    tags: ['travel', 'canvas'], colors: ['Field Green', 'Charcoal'],
    description: '<p>Airline-compliant 40L duffel with stowable backpack straps, a lay-flat opening, and five external pockets.</p>',
  },
  {
    slug: 'wool-scarf', title: 'Recycled Wool Scarf', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing Accessories > Scarves', price: 38, cost: 13, weight: 220,
    tags: ['winter', 'sustainable', 'gift'], colors: ['Heather Grey', 'Rust', 'Ink Blue'],
    description: '<p>Brushed recycled-wool twill scarf with hand-knotted fringe. 200 × 35cm.</p>',
  },
  {
    slug: 'canvas-dopp-kit', title: 'Canvas Dopp Kit', type: 'Bags', vendor: 'Trailhead Supply',
    category: 'Apparel & Accessories > Luggage > Toiletry Bags', price: 32, cost: 11, weight: 240,
    tags: ['travel', 'canvas', 'gift'], colors: ['Natural', 'Field Green'],
    description: '<p>Waxed-canvas toiletry bag with a wipe-clean lining, wide-mouth zip, and a leather pull.</p>',
  },
  {
    slug: 'kids-organic-tee', title: 'Kids Organic Tee', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing > Kids', price: 18, cost: 6, weight: 120,
    tags: ['kids', 'cotton', 'essential'], colors: ['Sunshine', 'Sky', 'Sage'], sizes: ['2T', '4T', '6Y'],
    description: '<p>The Classic Cotton Tee, shrunk down. Same 220gsm organic cotton, playful colors, tagless neck.</p>',
  },
  {
    slug: 'kids-fleece-pullover', title: 'Kids Fleece Pullover', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing > Kids', price: 34, cost: 12, weight: 300,
    tags: ['kids', 'fleece'], colors: ['Oatmeal', 'Forest'], sizes: ['2T', '4T', '6Y'],
    description: '<p>Half-zip micro-fleece pullover with thumb loops and a kangaroo pocket. Playground-approved.</p>',
  },
  {
    slug: 'enamel-camping-mug', title: 'Enamel Camping Mug', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Sporting Goods > Outdoor > Camp Kitchen', price: 16, cost: 5, weight: 210,
    tags: ['outdoor', 'campfire', 'gift'], colors: ['Cream', 'Forest'],
    description: '<p>Classic speckled enamel mug, 16oz, campfire-safe rolled rim. The one you will inevitably lose and re-buy.</p>',
  },
  {
    slug: 'cast-iron-skillet', title: 'Pre-Seasoned Cast Iron Skillet', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Cookware', price: 42, cost: 15, weight: 2300,
    tags: ['kitchen', 'bestseller'],
    description: '<p>10.25" cast iron skillet, pre-seasoned with flaxseed oil. Oven-, grill-, and campfire-safe with a helper handle.</p>',
  },
  {
    slug: 'ceramic-vase', title: 'Matte Ceramic Vase', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Decor > Vases', price: 34, cost: 12, weight: 980,
    tags: ['home', 'ceramic'], colors: ['Cream', 'Ink Blue', 'Clay'],
    description: '<p>Wheel-thrown vase with a soft matte glaze, 8" tall. Watertight; loves branches as much as blooms.</p>',
  },
  {
    slug: 'linen-apron', title: 'Stonewashed Linen Apron', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Aprons', price: 36, cost: 12, weight: 310,
    tags: ['kitchen', 'linen', 'gift'], colors: ['Natural', 'Ink Blue'],
    description: '<p>Cross-back linen apron with an adjustable chest strap and a generous front pocket. Gets better every wash.</p>',
  },
  {
    slug: 'bamboo-cutlery-set', title: 'Travel Bamboo Cutlery Set', type: 'Outdoor', vendor: 'Northstar Goods',
    category: 'Sporting Goods > Outdoor > Camp Kitchen', price: 14, cost: 4, weight: 90,
    tags: ['outdoor', 'sustainable'],
    description: '<p>Fork, knife, spoon, chopsticks, and straw in a rolled hemp sleeve. Dishwasher-safe bamboo.</p>',
  },
  {
    slug: 'fingerless-gloves', title: 'Merino Fingerless Gloves', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing Accessories > Gloves', price: 26, cost: 9, weight: 80,
    tags: ['winter', 'wool'], colors: ['Charcoal', 'Oat'],
    description: '<p>Touchscreen-friendly merino gloves with a long cuff. For runs, commutes, and cold offices.</p>',
  },
  {
    slug: 'stainless-lunch-box', title: 'Stainless Lunch Box', type: 'Kitchen', vendor: 'Northstar Goods',
    category: 'Home & Garden > Kitchen & Dining > Food Storage', price: 28, cost: 10, weight: 520,
    tags: ['kitchen', 'sustainable'], colors: ['Brushed Steel', 'Matte Black'],
    description: '<p>Two-tier 1.2L stainless lunch box with a clip-lock lid. Leak-resistant, plastic-free, dishwasher-safe.</p>',
  },
  {
    slug: 'bar-soap-trio', title: 'Cold-Process Bar Soap Trio', type: 'Home', vendor: 'Hearthstone',
    category: 'Health & Beauty > Personal Care > Bath', price: 18, cost: 6, weight: 380,
    tags: ['home', 'handmade', 'gift'],
    description: '<p>Three 4.5oz bars — pine tar, oat milk, and citrus hop — cured 6 weeks in small batches.</p>',
  },
  {
    slug: 'room-spray', title: 'Botanical Room Spray', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Decor > Home Fragrance', price: 20, cost: 7, weight: 280,
    tags: ['home', 'gift'], colors: ['Cedar', 'Lavender', 'Citrus'],
    description: '<p>8oz fine-mist room spray with essential oils and zero synthetic fragrance. Two sprays, whole room.</p>',
  },
  {
    slug: 'postcard-pack', title: 'Northstar Postcard Pack', type: 'Stationery', vendor: 'Northstar Goods',
    category: 'Office & School Supplies > Paper > Postcards', price: 12, cost: 4, weight: 110,
    tags: ['stationery', 'gift'],
    description: '<p>Eight letterpress postcards printed on cotton paper — one for each product family that started it all.</p>',
  },
  {
    slug: 'dog-rope-leash', title: 'Braided Rope Dog Leash', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Animals & Pet Supplies > Pet Supplies > Dog', price: 30, cost: 10, weight: 260,
    tags: ['pets', 'outdoor'], colors: ['Field Green', 'Rust'],
    description: '<p>6ft climbing-rope leash with a brass trigger snap and a woven handle wrap. 250lb breaking strength.</p>',
  },
  {
    slug: 'olive-oil-cruet', title: 'Stoneware Olive Oil Cruet', type: 'Kitchen', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Serveware', price: 24, cost: 8, weight: 420,
    tags: ['kitchen', 'ceramic'],
    description: '<p>Matte stoneware cruet with a drip-free spout and cork stopper. 10oz.</p>',
  },
  {
    slug: 'pothos-care-kit', title: 'Plant Care Kit', type: 'Home', vendor: 'Northstar Goods',
    category: 'Home & Garden > Lawn & Garden > Tools', price: 26, cost: 9, weight: 540,
    tags: ['home', 'gift', 'new-arrival'],
    description: '<p>Brass mister, bamboo tags, snips, and a 200ml nutrient concentrate — everything a shelf garden needs.</p>',
  },
  {
    slug: 'waffle-towel-set', title: 'Waffle Weave Towel Set', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Linens > Towels', price: 44, compareAt: 52, cost: 15, weight: 720,
    tags: ['home', 'bath'], colors: ['Cream', 'Sage'],
    description: '<p>Two bath towels and two hand towels in airy waffle-weave organic cotton. Dries twice as fast as terry.</p>',
  },
  {
    slug: 'slate-coasters', title: 'Slate Coaster Set', type: 'Home', vendor: 'Hearthstone',
    category: 'Home & Garden > Kitchen & Dining > Tableware', price: 22, cost: 7, weight: 640,
    tags: ['home', 'gift'],
    description: '<p>Four 4" natural-slate coasters with felted undersides. Chalk-friendly for marking your glass.</p>',
  },
  {
    slug: 'trail-water-flask', title: 'Collapsible Trail Flask', type: 'Outdoor', vendor: 'Trailhead Supply',
    category: 'Sporting Goods > Outdoor > Hydration', price: 22, cost: 7, weight: 120,
    tags: ['outdoor', 'ultralight'], colors: ['Juniper', 'Sandstone'],
    description: '<p>500ml silicone flask that rolls up when empty. Bite valve, tumble-dryer safe (no), taste-neutral.</p>',
  },
  {
    slug: 'merino-crew-socks', title: 'Merino Crew Socks', type: 'Apparel', vendor: 'Meridian Basics',
    category: 'Apparel & Accessories > Clothing Accessories > Socks', price: 16, cost: 5, weight: 70,
    tags: ['wool', 'essential'], colors: ['Charcoal', 'Oat', 'Rust'],
    description: '<p>Everyday merino crew socks — temperature-regulating, odor-resistant, cushioned heel. One size.</p>',
  },
  {
    slug: 'yoga-program-video', title: 'Yoga Flow Program — Digital Download', type: 'Digital', vendor: 'Northstar Goods',
    category: 'Digital Goods > Fitness & Yoga', price: 19, cost: 0, weight: 0,
    tags: ['digital', 'fitness', 'new-arrival'],
    requiresShipping: false,
    trackQuantity: false,
    description:
      '<p>A 4-week video yoga program with downloadable class plans and a printable pose guide. Delivered instantly to your inbox — nothing ships.</p>',
  },
]

// Locations (spec: 5+)
export const LOCATION_DEFS = [
  { name: 'Portland Warehouse', address1: '4218 Alder St', city: 'Portland', province: 'OR', zip: '97201', phone: '(503) 555-0142' },
  { name: 'Portland Flagship', address1: '112 SW Pine St', city: 'Portland', province: 'OR', zip: '97204', phone: '(503) 555-0198' },
  { name: 'Brooklyn Studio', address1: '77 Greenpoint Ave', city: 'Brooklyn', province: 'NY', zip: '11222', phone: '(718) 555-0117' },
  { name: 'Austin Market', address1: '1900 Barton Springs Rd', city: 'Austin', province: 'TX', zip: '78704', phone: '(512) 555-0163' },
  { name: 'Return Center', address1: '9 Quarry industrial Park', city: 'Minneapolis', province: 'MN', zip: '55413', phone: '(612) 555-0184' },
]

export const PAYMENT_GATEWAYS = ['Shopify Payments', 'PayPal', 'Apple Pay']

export const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL']

export const PRODUCT_TAGS_POOL = [
  'bestseller', 'essential', 'gift', 'new-arrival', 'sale', 'limited', 'sustainable',
  'handmade', 'imported', 'staff-pick',
]

export const CUSTOMER_TAGS_POOL = ['vip', 'repeat', 'wholesale', 'newsletter', 'high-value', 'local']
