// Debug: find orders with null isDraft in localStorage
const st = JSON.parse(localStorage.getItem('northstar-admin-v1') || '{}')
const orders = (st.state && st.state.orders) || []
const bad = orders.filter(function (o) {
  return !o || o.isDraft == null
})
document.title = JSON.stringify({ total: orders.length, bad: bad.length, names: bad.slice(0, 3).map(function (o) { return o ? o.name : 'NULL' }) })
