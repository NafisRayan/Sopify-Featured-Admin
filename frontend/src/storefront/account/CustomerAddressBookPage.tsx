import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'
import type { CustomerMailingAddressInput } from '@/services/storefrontCustomerService'

export function CustomerAddressBookPage() {
  const navigate = useNavigate()
  const {
    customer,
    isAuthenticated,
    addAddress,
    removeAddress,
    setDefaultAddress,
    refreshProfile,
    isLoading,
  } = useStorefrontCustomer()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [address1, setAddress1] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('United States')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/store/account/login')
    } else {
      refreshProfile()
    }
  }, [isAuthenticated, navigate, refreshProfile])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const newAddress: CustomerMailingAddressInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      address1: address1.trim(),
      city: city.trim(),
      province: province.trim(),
      zip: zip.trim(),
      country: country.trim(),
      phone: phone.trim() || undefined,
    }
    const success = await addAddress(newAddress)
    if (success) {
      setIsModalOpen(false)
      setFirstName('')
      setLastName('')
      setAddress1('')
      setCity('')
      setProvince('')
      setZip('')
      setPhone('')
    }
  }

  const addresses = customer?.addresses.edges.map((e) => e.node) || []
  const defaultAddressId = customer?.defaultAddress?.id

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 space-y-8">
      {/* Return to account link */}
      <Link
        to="/store/account"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight flex items-center gap-2.5">
            <MapPin size={24} /> Address Book
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage your saved shipping and billing destinations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-sm"
        >
          <Plus size={14} /> Add New Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="bg-neutral-50 rounded-2xl border border-neutral-200/90 p-8 text-center">
          <p className="text-sm font-semibold text-neutral-800 mb-1">No addresses saved yet</p>
          <p className="text-xs text-neutral-500 mb-4">
            Add an address to expedite your checkout process.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 transition"
          >
            <Plus size={14} /> Add Address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {addresses.map((addr) => {
            const isDefault = addr.id === defaultAddressId

            return (
              <div
                key={addr.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between transition ${
                  isDefault
                    ? 'border-neutral-900 bg-neutral-50/60 ring-1 ring-neutral-900/10'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-neutral-900">
                      {addr.firstName} {addr.lastName}
                    </span>
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={11} /> Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-600 space-y-0.5 leading-relaxed">
                    <p>{addr.address1}</p>
                    {addr.address2 && <p>{addr.address2}</p>}
                    <p>
                      {addr.city}, {addr.province} {addr.zip}
                    </p>
                    <p>{addr.country}</p>
                    {addr.phone && <p className="text-neutral-400 mt-1">{addr.phone}</p>}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between gap-2">
                  {!isDefault ? (
                    <button
                      type="button"
                      onClick={() => setDefaultAddress(addr.id)}
                      className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition"
                    >
                      Set as Default
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">Primary delivery</span>
                  )}

                  <button
                    type="button"
                    onClick={() => removeAddress(addr.id)}
                    className="p-1 text-neutral-400 hover:text-red-500 transition"
                    title="Delete address"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Address Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-neutral-900 mb-4">Add Shipping Address</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  placeholder="123 Market St, Suite 400"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    State / Province
                  </label>
                  <input
                    type="text"
                    required
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    required
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Country</label>
                <input
                  type="text"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 transition"
                >
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
