'use client'

import { useState, useRef, useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'
import { getInvoiceResult, CURRENCIES } from '@/lib/constants'
import { fetchXeroContacts, sendInvoiceToXero, XeroContact } from '@/lib/xero'
import InvoiceSuccessModal from './InvoiceSuccessModal'
import { logAuditEvent } from '@/lib/audit'

type InvoiceFlowProps = {
  user: {
    email: string
    name: string
    fullName: string
    imageUrl?: string
  }
}

export default function InvoiceFlow({ user }: InvoiceFlowProps) {
  const { signOut } = useClerk()

  /* ---------------- STATE ---------------- */
  const [itemLocation, setItemLocation] = useState<string | null>(null)
  const [clientLocation, setClientLocation] = useState<string | null>(null)
  const [purchaseType, setPurchaseType] = useState<string | null>(null)
  const [shippingOption, setShippingOption] = useState<string | null>(null)
  const [directShip, setDirectShip] = useState<string | null>(null)
  const [insuranceLanded, setInsuranceLanded] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [dueDate, setDueDate] = useState('')
  const [dropdownResults, setDropdownResults] = useState<XeroContact[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState({
    invoiceNumber: '',
    contactName: '',
    total: '',
    amountDue: '',
    taxSummary: '',
    invoiceUrl: '',
  })

  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  /* --------------------------------------------------
     CUSTOMER SEARCH (Xero → Make webhook)
  -------------------------------------------------- */
  const handleCustomerInput = async (value: string) => {
    setCustomerName(value)
    setSelectedIndex(-1)
    setIsSearchActive(true)

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (value.length >= 2) {
      debounceTimer.current = setTimeout(async () => {
        setLoadingCustomers(true)
        const results = await fetchXeroContacts(value)
        setDropdownResults(results)
        setLoadingCustomers(false)
      }, 300)
    } else {
      setDropdownResults([])
      setIsSearchActive(false)
    }
  }

  const selectCustomer = (contact: XeroContact) => {
    setCustomerName(contact.Name)
    setDropdownResults([])
    setSelectedIndex(-1)
    setIsSearchActive(false)
  }

  /* --------------------------------------------------
     VALIDATION
  -------------------------------------------------- */
  const validateFields = () => {
    const newErrors: Record<string, string> = {}
    if (!customerName) newErrors.customerName = 'Customer name is required.'
    if (!itemDescription) newErrors.itemDescription = 'Item description is required.'
    if (!price) newErrors.price = 'Price is required.'
    if (!dueDate) newErrors.dueDate = 'Due date is required.'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid = customerName && itemDescription && price && dueDate

  /* --------------------------------------------------
     TAX LOGIC (FULLY FIXED)
  -------------------------------------------------- */
  const result = getInvoiceResult(
    itemLocation,
    clientLocation,
    purchaseType,
    shippingOption,
    directShip,
    insuranceLanded
  )

  /* --------------------------------------------------
     SEND TO XERO (Make Webhook)
  -------------------------------------------------- */
  const sendToXero = async () => {
    if (!result) {
      alert('Please complete invoice setup first.')
      return
    }

    if (!validateFields()) return

    setSending(true)

    try {
      // Log invoice creation attempt
      await logAuditEvent(
        'INVOICE_CREATE_ATTEMPT',
        {
          customerName,
          itemDescription,
          price: parseFloat(price),
          currency,
          dueDate,
          accountCode: result.accountCode,
          taxType: result.taxType,
          brandTheme: result.brandTheme,
        },
        {
          email: user.email,
          userId: user.email,
          firstName: user.name,
          lastName: '',
        }
      )

      const response = await sendInvoiceToXero(
        result,
        customerName,
        itemDescription,
        price,
        currency,
        dueDate
      )

      // Log successful invoice creation
      await logAuditEvent(
        'INVOICE_CREATE_SUCCESS',
        {
          customerName,
          itemDescription,
          price: parseFloat(price),
          currency,
          accountCode: result.accountCode,
          invoiceNumber: response.invoiceNumber,
        },
        {
          email: user.email,
          userId: user.email,
          firstName: user.name,
          lastName: '',
        }
      )

      // Validate we have an invoice URL
      if (!response.invoiceUrl) {
        window.location.href = '/invoice/error'
        return
      }

      // Build tax summary from result
      const taxSummary = `Tax Type: ${result.taxLabel}
Account Code: ${result.accountCode}
Amounts Are: ${result.amountsAre}
Brand Theme: ${result.brandTheme}
VAT Reclaim: ${result.vatReclaim}`

      // Set success data and show modal
      setSuccessData({
        invoiceNumber: response.invoiceNumber || 'N/A',
        contactName: response.contactName || customerName,
        total: response.total?.toString() || price,
        amountDue: response.amountDue?.toString() || price,
        taxSummary,
        invoiceUrl: response.invoiceUrl,
      })

      setSending(false)
      setShowSuccess(true)
    } catch (err) {
      // Log invoice creation failure
      await logAuditEvent(
        'INVOICE_CREATE_FAILURE',
        {
          customerName,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        {
          email: user.email,
          userId: user.email,
          firstName: user.name,
          lastName: '',
        }
      )

      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setSending(false)
    }
  }

  /* --------------------------------------------------
     LOGOUT HANDLER
  -------------------------------------------------- */
  const handleLogout = async () => {
    await logAuditEvent(
      'USER_LOGOUT',
      { logoutTime: new Date().toISOString() },
      {
        email: user.email,
        userId: user.email,
        firstName: user.name,
        lastName: '',
      }
    )
    await signOut()
  }

  /* --------------------------------------------------
     RESET FORM
  -------------------------------------------------- */
  const reset = () => {
    setItemLocation(null)
    setClientLocation(null)
    setPurchaseType(null)
    setShippingOption(null)
    setDirectShip(null)
    setInsuranceLanded(null)
    setCustomerName('')
    setPrice('')
    setItemDescription('')
    setCurrency('GBP')
    setDueDate('')
    setDropdownResults([])
    setErrors({})
    setSelectedIndex(-1)
    setIsSearchActive(false)
  }

  /* --------------------------------------------------
     UI RENDER
  -------------------------------------------------- */
  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      {/* HEADER — Premium luxury design with perfectly centered logo */}
      <header className="bg-black text-white mb-8">
        {/*
          Container structure ensures absolute centering:
          - Relative positioning allows absolute child positioning
          - Logo is centered using absolute positioning + transform
          - Logout button is positioned in top-right independently
        */}
        <div className="relative px-8 py-10">

          {/* Logout button — Top right corner, minimal and unobtrusive */}
          <button
            onClick={handleLogout}
            className="absolute top-6 right-6 text-[10px] uppercase tracking-[0.15em] text-gray-400 hover:text-white transition-colors duration-300 font-light"
          >
            Logout →
          </button>

          {/* Logo — Absolutely centered regardless of other elements */}
          <div className="flex flex-col items-center">
            {/* Main logo lockup */}
            <div className="font-serif tracking-[0.3em] text-[28px] font-light leading-none mb-1">
              CLUB<span className="text-[32px] font-normal">19</span>
            </div>
            {/* Subtext */}
            <div className="font-serif tracking-[0.45em] text-[11px] font-extralight text-gray-300">
              LONDON
            </div>
          </div>

          {/* Divider — Elegant thin line with subtle gradient fade */}
          <div className="mt-8 mb-6 h-[0.5px] bg-gradient-to-r from-transparent via-gray-500 to-transparent"></div>

          {/* Page title — Refined typography */}
          <h1 className="text-center font-light tracking-[0.2em] text-[15px] uppercase text-gray-200">
            Invoice Flow
          </h1>

          {/* User context — Subtle and discrete */}
          <p className="text-center text-[10px] tracking-[0.1em] text-gray-500 mt-4 font-light">
            {user.email}
          </p>
        </div>
      </header>

      {/* STEP 1 */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="font-semibold mb-3">1. Where is the item?</h2>
        <button
          className={`w-full p-3 border rounded mb-2 ${
            itemLocation === 'uk' ? 'border-black bg-gray-100' : 'border-gray-300'
          }`}
          onClick={() => {
            setItemLocation('uk')
            setClientLocation(null)
            setPurchaseType(null)
            setShippingOption(null)
            setDirectShip(null)
            setInsuranceLanded(null)
          }}
        >
          Item is in UK
        </button>
        <button
          className={`w-full p-3 border rounded ${
            itemLocation === 'outside' ? 'border-black bg-gray-100' : 'border-gray-300'
          }`}
          onClick={() => {
            setItemLocation('outside')
            setClientLocation(null)
            setPurchaseType(null)
            setShippingOption(null)
            setDirectShip(null)
            setInsuranceLanded(null)
          }}
        >
          Item is outside UK
        </button>
      </div>

      {/* STEP 2 */}
      {itemLocation && (
        <div className="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
          <h2 className="font-semibold mb-3">2. Where is the client?</h2>
          <button
            className={`w-full p-3 border rounded mb-2 ${
              clientLocation === 'uk' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
            onClick={() => {
              setClientLocation('uk')
              setPurchaseType(null)
              setShippingOption(null)
              setDirectShip(null)
              setInsuranceLanded(null)
            }}
          >
            Client is in UK
          </button>
          <button
            className={`w-full p-3 border rounded ${
              clientLocation === 'outside' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
            onClick={() => {
              setClientLocation('outside')
              setPurchaseType(null)
              setShippingOption(null)
              setDirectShip(null)
              setInsuranceLanded(null)
            }}
          >
            Client is outside UK
          </button>
        </div>
      )}

      {/* STEP 3 — UK purchase type */}
      {itemLocation === 'uk' && clientLocation && (
        <div className="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
          <h2 className="font-semibold mb-3">3. How is the item purchased?</h2>
          <button
            onClick={() => setPurchaseType('retail')}
            className={`w-full p-3 border rounded mb-2 ${
              purchaseType === 'retail' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
          >
            From retail store
          </button>
          <button
            onClick={() => setPurchaseType('margin')}
            className={`w-full p-3 border rounded ${
              purchaseType === 'margin' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
          >
            On UK margin rule
          </button>
        </div>
      )}

      {/* STEP 3 — Outside → UK shipping */}
      {itemLocation === 'outside' && clientLocation === 'uk' && (
        <div className="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
          <h2 className="font-semibold mb-3">3. Can client ship to other countries?</h2>
          <button
            onClick={() => {
              setShippingOption('no')
              setDirectShip(null)
              setInsuranceLanded(null)
            }}
            className={`w-full p-3 border rounded mb-2 ${
              shippingOption === 'no' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
          >
            No
          </button>
          <button
            onClick={() => {
              setShippingOption('yes')
              setDirectShip(null)
              setInsuranceLanded(null)
            }}
            className={`w-full p-3 border rounded ${
              shippingOption === 'yes' ? 'border-black bg-gray-100' : 'border-gray-300'
            }`}
          >
            Yes
          </button>
        </div>
      )}

      {/* STEP 4 — Direct ship */}
      {shippingOption === 'yes' &&
        itemLocation === 'outside' &&
        clientLocation === 'uk' && (
          <div className="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
            <h2 className="font-semibold mb-3">
              4. Can supplier ship directly to client?
            </h2>
            <button
              onClick={() => {
                setDirectShip('no')
                setInsuranceLanded(null)
              }}
              className={`w-full p-3 border rounded mb-2 ${
                directShip === 'no' ? 'border-black bg-gray-100' : 'border-gray-300'
              }`}
            >
              No
            </button>
            <button
              onClick={() => {
                setDirectShip('yes')
                setInsuranceLanded(null)
              }}
              className={`w-full p-3 border rounded ${
                directShip === 'yes' ? 'border-black bg-gray-100' : 'border-gray-300'
              }`}
            >
              Yes
            </button>
          </div>
        )}

      {/* STEP 5 — Insurance / landed cost */}
      {directShip === 'yes' &&
        itemLocation === 'outside' &&
        clientLocation === 'uk' &&
        shippingOption === 'yes' && (
          <div className="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
            <h2 className="font-semibold mb-3">
              5. Can supplier provide full insurance & landed cost?
            </h2>
            <button
              onClick={() => setInsuranceLanded('no')}
              className={`w-full p-3 border rounded mb-2 ${
                insuranceLanded === 'no' ? 'border-black bg-gray-100' : 'border-gray-300'
              }`}
            >
              No
            </button>
            <button
              onClick={() => setInsuranceLanded('yes')}
              className={`w-full p-3 border rounded ${
                insuranceLanded === 'yes' ? 'border-black bg-gray-100' : 'border-gray-300'
              }`}
            >
              Yes
            </button>
          </div>
        )}

      {/* FINAL SETTINGS PANEL */}
      {result && (
        <div className="bg-gray-100 border-t-4 border-black p-4 rounded-lg shadow animate-fade-in mb-6">
          <h3 className="font-bold text-lg mb-3">Invoice Settings</h3>
          <div className="space-y-4">
            {/* Invoice Item Line Detail */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Invoice Item Line Detail
              </div>
              <div className="font-medium whitespace-pre-line">
                {result.taxLiability}
              </div>
              {result.note && (
                <div className="text-sm text-amber-700 mt-2 italic">
                  {result.note}
                </div>
              )}
            </div>

            {/* Brand Theme */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Brand Theme
              </div>
              <div className="font-medium">{result.brandTheme}</div>
            </div>

            {/* Amounts Are */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Amounts Are
              </div>
              <div className="font-medium">{result.amountsAre}</div>
            </div>

            {/* Account Code */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Account Code
              </div>
              <div className="font-medium text-xl">{result.accountCode}</div>
            </div>

            {/* Xero Tax Code */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Xero Tax Code
              </div>
              <div className="font-medium">{result.taxType}</div>
            </div>

            {/* Friendly Tax Description */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Friendly Tax Description
              </div>
              <div className="font-medium">{result.taxLabel}</div>
            </div>

            {/* VAT Reclaim */}
            <div className="bg-white border p-3 rounded shadow-sm">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                VAT Reclaim
              </div>
              <div className="font-medium">{result.vatReclaim}</div>
            </div>
          </div>

          {/* INVOICE DETAILS FORM */}
          <div className="mt-6 border-t pt-4">
            <h3 className="font-bold text-lg mb-3">Invoice Details</h3>

            {/* Customer Name */}
            <div className="mb-4" ref={dropdownRef}>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Customer Name
              </label>
              <div className="relative">
                <input
                  className="w-full p-3 border-2 rounded focus:outline-none focus:border-black"
                  value={customerName}
                  placeholder="Start typing customer name…"
                  onChange={(e) => handleCustomerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (!dropdownResults.length) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedIndex((i) =>
                        i < dropdownResults.length - 1 ? i + 1 : i
                      )
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedIndex((i) => (i > 0 ? i - 1 : 0))
                    }
                    if (e.key === 'Enter' && selectedIndex >= 0) {
                      e.preventDefault()
                      selectCustomer(dropdownResults[selectedIndex])
                    }
                    if (e.key === 'Escape') {
                      setDropdownResults([])
                      setIsSearchActive(false)
                    }
                  }}
                />
                {loadingCustomers && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {dropdownResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 bg-white border-2 border-black rounded-lg max-h-48 overflow-auto w-full shadow">
                    {dropdownResults.map((c, i) => (
                      <li
                        key={i}
                        className={`p-3 cursor-pointer ${
                          selectedIndex === i
                            ? 'bg-black text-white'
                            : 'hover:bg-gray-200'
                        }`}
                        onClick={() => selectCustomer(c)}
                        onMouseEnter={() => setSelectedIndex(i)}
                      >
                        {c.Name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {errors.customerName && (
                <p className="text-red-600 text-sm mt-1">{errors.customerName}</p>
              )}
            </div>

            {/* Item Description */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Item Description
              </label>
              <input
                className="w-full p-3 border-2 rounded focus:outline-none focus:border-black"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
              {errors.itemDescription && (
                <p className="text-red-600 text-sm mt-1">{errors.itemDescription}</p>
              )}
            </div>

            {/* Price */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Price
              </label>
              <div className="flex gap-2">
                <select
                  className="p-3 border-2 rounded bg-white focus:border-black"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.symbol} {curr.code}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="flex-1 p-3 border-2 rounded focus:outline-none focus:border-black"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              {errors.price && <p className="text-red-600 text-sm mt-1">{errors.price}</p>}
            </div>

            {/* Due Date */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Due Date
              </label>
              <input
                type="date"
                className="w-full p-3 border-2 rounded focus:outline-none focus:border-black"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              {errors.dueDate && (
                <p className="text-red-600 text-sm mt-1">{errors.dueDate}</p>
              )}
            </div>
          </div>

          {/* Buttons */}
          <button
            onClick={sendToXero}
            disabled={sending || !isFormValid}
            className={`w-full mt-4 p-3 rounded font-medium flex justify-center items-center ${
              sending || !isFormValid
                ? 'bg-gray-400 text-gray-200'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Sending…
              </>
            ) : (
              'Create Invoice in Xero'
            )}
          </button>
          <button
            onClick={reset}
            className="w-full mt-2 p-3 rounded font-medium bg-black text-white hover:bg-gray-800"
          >
            Start Over
          </button>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <InvoiceSuccessModal
          show={showSuccess}
          onClose={() => setShowSuccess(false)}
          invoiceNumber={successData.invoiceNumber}
          contactName={successData.contactName}
          total={successData.total}
          amountDue={successData.amountDue}
          taxSummary={successData.taxSummary}
          invoiceUrl={successData.invoiceUrl}
          onCreateAnother={reset}
        />
      )}
    </div>
  )
}
