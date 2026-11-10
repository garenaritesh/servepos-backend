import { useEffect, useState } from 'react'
import { seedData } from './data'
import { Armchair, BarChart3, Boxes, Check, ChefHat, CircleDollarSign, ClipboardList, ConciergeBell, CreditCard, Eye, EyeOff, LayoutDashboard, LogOut, Minus, Package, Plus, Printer, Receipt, Search, Settings, ShoppingBag, Utensils, Users, X } from 'lucide-react'

const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const today = () => new Date().toISOString().slice(0, 10)
const clone = x => JSON.parse(JSON.stringify(x))
const load = () => {
  try {
    // Start this release with a clean restaurant workspace, rather than carrying demo records forward.
    if (localStorage.getItem('servepos-l1-schema-v1') !== '1') {
      localStorage.removeItem('servepos-l1-data')
      localStorage.setItem('servepos-l1-schema-v1', '1')
      return clone(seedData)
    }
    const raw = localStorage.getItem('servepos-l1-data')
    return raw ? JSON.parse(raw) : clone(seedData)
  } catch { return clone(seedData) }
}
const loadUsers = () => { try { return JSON.parse(localStorage.getItem('servepos-l1-users') || '[]') } catch { return [] } }
const loadSession = () => { try { return JSON.parse(localStorage.getItem('servepos-l1-session') || 'null') } catch { return null } }

const DB_NAME = 'servepos-local-db'
const DB_STORE = 'app'
function openLocalDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available in this browser'))
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local database'))
  })
}
async function readLocalData() {
  const db = await openLocalDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get('restaurant-data')
    request.onsuccess = () => { db.close(); resolve(request.result || null) }
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not read local database')) }
  })
}
async function writeLocalData(value) {
  const db = await openLocalDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, 'restaurant-data')
    tx.oncomplete = () => { db.close(); resolve(true) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save local database')) }
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Local database save was cancelled')) }
  })
}
const roles = [
  { id: 'Owner', label: 'Owner dashboard', icon: LayoutDashboard },
  { id: 'Waiter', label: 'Waiter station', icon: ConciergeBell },
  { id: 'Kitchen', label: 'Kitchen display', icon: ChefHat },
  { id: 'Parcel', label: 'Parcel counter', icon: Package },
  { id: 'Cashier', label: 'Billing counter', icon: CreditCard },
]
async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export default function App() {
  const [data, setData] = useState(load)
  const [users, setUsers] = useState(loadUsers)
  const [session, setSession] = useState(loadSession)
  const [workspace, setWorkspace] = useState(loadSession()?.role || 'Owner')
  const [page, setPage] = useState('Take Order')
  const [syncState, setSyncState] = useState('Offline-first · local data')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null)
  const [billPreview, setBillPreview] = useState(null)
  const [localDbReady, setLocalDbReady] = useState(false)
  const [localDbError, setLocalDbError] = useState('')
  const [syncToken, setSyncToken] = useState(() => localStorage.getItem('servepos-sync-token') || '')
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('servepos-auto-sync') === 'true')
  const [cloudRevision, setCloudRevision] = useState(() => Number(localStorage.getItem('servepos-cloud-revision') || 0))
  const [cloudStatus, setCloudStatus] = useState('Not synced yet')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [networkRetryTick, setNetworkRetryTick] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState(localStorage.getItem('servepos-last-sync') || '')
  const [deviceId] = useState(() => { let id = localStorage.getItem('servepos-device-id'); if (!id) { id = 'device-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()); localStorage.setItem('servepos-device-id', id) } return id })

  // Migrate the current browser data into IndexedDB, then use IndexedDB for ongoing saves.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const saved = await readLocalData()
        if (!alive) return
        if (saved) setData(saved)
        else await writeLocalData(data)
        // Free the browser's small localStorage quota after the IndexedDB copy is safe.
        try { localStorage.removeItem('servepos-l1-data') } catch {}
        if (alive) setLocalDbReady(true)
      } catch (error) {
        console.error('ServePOS local database error:', error)
        if (alive) {
          setLocalDbError(error?.message || 'Local database is unavailable')
          setLocalDbReady(true)
        }
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!localDbReady || localDbError) return
    writeLocalData(data).catch(error => {
      console.error('ServePOS local database save failed:', error)
      setLocalDbError(error?.message || 'Could not save restaurant data')
    })
  }, [data, localDbReady, localDbError])
  useEffect(() => { localStorage.setItem('servepos-l1-users', JSON.stringify(users)) }, [users])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) } }, [toast])
  useEffect(() => { localStorage.setItem('servepos-sync-token', syncToken) }, [syncToken])
  useEffect(() => { localStorage.setItem('servepos-auto-sync', String(autoSync)) }, [autoSync])
  useEffect(() => { localStorage.setItem('servepos-cloud-revision', String(cloudRevision)) }, [cloudRevision])

  const cloudRequest = async (payload) => {
    if (!syncToken.trim()) throw new Error('Enter the sync token in Settings first.')
    // Use the deployed Vercel API origin explicitly: Capacitor's app origin is
    // localhost, so a relative /api/sync URL does not reach the cloud backend.
    const apiUrl = 'https://servepos-backend.vercel.app/api/sync'
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Device is offline. Changes remain saved locally and will sync when internet returns.')
    }
    let response
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${syncToken.trim()}` },
        body: JSON.stringify({ ...payload, deviceId, syncType: payload.syncType || 'manual' })
      })
    } catch {
      throw new Error('Cannot reach ServePOS cloud. Check internet; changes remain saved locally.')
    }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error('Cloud API returned a non-JSON response. Check the Vercel API deployment.')
    }
    const result = await response.json()
    if (!response.ok) {
      if (response.status === 409) throw new Error(`Cloud revision conflict. Cloud is at revision ${result.revision}. Download cloud data after making a local backup.`)
      throw new Error(result.error || `Sync failed (${response.status})`)
    }
    if (payload.action === 'save' && !Number.isFinite(Number(result.revision))) {
      throw new Error('Cloud API response is missing a valid revision. Data was not marked as synced.')
    }
    if (payload.action === 'get' && (!Number.isFinite(Number(result.revision)) || !result.data || typeof result.data !== 'object')) {
      throw new Error('Cloud API returned incomplete restore data.')
    }
    return result
  }
  const manualCloudUpload = async () => {
    if (cloudBusy) return
    setCloudBusy(true); setCloudStatus('Uploading local data…')
    try {
      const result = await cloudRequest({ action: 'save', data, expectedRevision: cloudRevision, syncType: 'manual' })
      setCloudRevision(result.revision); const stamp = new Date().toISOString(); setLastSyncAt(stamp); localStorage.setItem('servepos-last-sync', stamp)
      setCloudStatus(`Uploaded successfully · revision ${result.revision}`); notify('Cloud backup uploaded successfully')
    } catch (error) { setCloudStatus(error.message || 'Upload failed'); notify(error.message || 'Cloud upload failed') }
    finally { setCloudBusy(false) }
  }
  const manualCloudDownload = async () => {
    if (cloudBusy) return
    if (!confirm('Download cloud data and replace the current local restaurant data? Export a local backup first.')) return
    setCloudBusy(true); setCloudStatus('Downloading cloud data…')
    try {
      const result = await cloudRequest({ action: 'get' })
      if (!result.data || typeof result.data !== 'object') throw new Error('Cloud data is empty or invalid.')
      await writeLocalData(result.data); setData(result.data); setCloudRevision(result.revision)
      const stamp = new Date().toISOString(); setLastSyncAt(stamp); localStorage.setItem('servepos-last-sync', stamp)
      setCloudStatus(`Downloaded successfully · revision ${result.revision}`); notify('Cloud data restored to this device')
    } catch (error) { setCloudStatus(error.message || 'Download failed'); notify(error.message || 'Cloud download failed') }
    finally { setCloudBusy(false) }
  }
  // Reconnect-aware auto sync: keep local changes safe while offline and retry on browser online events.
  useEffect(() => {
    if (!autoSync || !localDbReady || localDbError || !syncToken.trim()) return
    const handleOffline = () => setCloudStatus('Offline · changes are saved locally and waiting to sync')
    const handleOnline = () => {
      setCloudStatus('Internet restored · preparing automatic sync…')
      setNetworkRetryTick(value => value + 1)
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    if (!navigator.onLine) handleOffline()
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [autoSync, localDbReady, localDbError, syncToken])

  useEffect(() => {
    if (!autoSync || !localDbReady || localDbError || !syncToken.trim()) return
    const timer = setTimeout(async () => {
      if (cloudBusy) return
      if (!navigator.onLine) {
        setCloudStatus('Offline · changes are saved locally and waiting to sync')
        return
      }
      setCloudBusy(true)
      setCloudStatus('Auto sync uploading…')
      try {
        const result = await cloudRequest({ action: 'save', data, expectedRevision: cloudRevision, syncType: 'automatic' })
        setCloudRevision(result.revision)
        const stamp = new Date().toISOString()
        setLastSyncAt(stamp)
        localStorage.setItem('servepos-last-sync', stamp)
        setCloudStatus(`Auto sync complete · revision ${result.revision}`)
      } catch (error) {
        setCloudStatus(`${error.message || 'Auto sync failed'} · will retry when connection is restored`)
        if (String(error.message).includes('conflict')) setAutoSync(false)
      } finally {
        setCloudBusy(false)
      }
    }, 2500)
    return () => clearTimeout(timer)
  }, [data, autoSync, localDbReady, localDbError, syncToken, cloudRevision, networkRetryTick])

  const notify = msg => setToast(msg)
  const update = patch => setData(d => ({ ...d, ...patch }))
  const updateUsers = next => setUsers(next)
  const logout = () => { localStorage.removeItem('servepos-l1-session'); setSession(null); setWorkspace('Owner'); setPage('Take Order'); setModal(null) }
  const login = async (username, password) => {
    const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())
    if (!user || !user.active || user.passwordHash !== await hashPassword(password)) return false
    const next = { id: user.id, name: user.name, username: user.username, role: user.role }
    localStorage.setItem('servepos-l1-session', JSON.stringify(next))
    setSession(next); setWorkspace(next.role); setPage('Take Order')
    return true
  }
  const createOwner = async ({ restaurantName, name, username, password }) => {
    const user = { id: 'u' + Date.now(), name, username: username.trim(), role: 'Owner', passwordHash: await hashPassword(password), active: true }
    setData(d => ({ ...d, restaurant: { ...d.restaurant, name: restaurantName.trim() } }))
    setUsers([user])
    const next = { id: user.id, name: user.name, username: user.username, role: user.role }
    localStorage.setItem('servepos-l1-session', JSON.stringify(next))
    setSession(next); setWorkspace('Owner'); setPage('Take Order')
  }
  const switchWorkspace = next => {
    if (session?.role !== 'Owner') return
    setWorkspace(next)
    setPage(next === 'Owner' ? 'Overview' : next)
  }

  if (!users.length) return <FirstRunSetup onCreate={createOwner}/>
  if (!session) return <LoginScreen users={users} onLogin={login}/>
  const role = session.role === 'Owner' ? workspace : session.role
  const orders = data.orders || []
  const activeDineIn = orders.filter(o => o.type === 'Dine-in' && o.status !== 'Paid' && o.status !== 'Cancelled')
  const todayOrders = orders.filter(o => o.date === today())
  const todaySales = todayOrders.filter(o => o.status === 'Paid').reduce((sum, o) => sum + o.total, 0)

  const recipeFor = menuItem => (menuItem?.recipe || []).map(r => {
    const ingredient = (data.ingredients || []).find(x => x.id === r.ingredientId)
    return ingredient ? { ingredientId: ingredient.id, name: ingredient.name, qty: Number(r.qty || 0), unit: ingredient.unit, unitCost: Number(ingredient.unitCost || 0) } : null
  }).filter(Boolean)
  const recipeUnitCost = menuItem => recipeFor(menuItem).reduce((sum,r) => sum + r.qty * r.unitCost, 0)
  const priceItems = items => items.map(i => {
    const menuItem = data.menu.find(m => m.id === i.id)
    const recipe = recipeFor(menuItem)
    const cost = recipe.length ? recipeUnitCost(menuItem) : Number(menuItem?.cost ?? i.cost ?? 0)
    return { ...i, cost, lineCost: cost * i.qty, recipeSnapshot: recipe.map(r => ({...r, qty: r.qty})) }
  })
  const ingredientNeeds = items => {
    const needs = {}
    items.forEach(item => {
      const m = data.menu.find(x => x.id === item.id)
      recipeFor(m).forEach(r => { needs[r.ingredientId] = (needs[r.ingredientId] || 0) + r.qty * Number(item.qty || 0) })
    })
    return needs
  }
  const stockCheck = items => {
    const needs = ingredientNeeds(items)
    const ingredientShort = Object.entries(needs).find(([id,qty]) => {
      const ing = (data.ingredients || []).find(x => x.id === id)
      return !ing || Number(ing.stock || 0) < qty
    })
    if (ingredientShort) {
      const ing = (data.ingredients || []).find(x => x.id === ingredientShort[0])
      alert(`Insufficient ${ing?.name || 'ingredient'} stock. Available: ${ing?.stock ?? 0} ${ing?.unit || ''}, required: ${ingredientShort[1]} ${ing?.unit || ''}. Restock from Ingredients.`)
      return false
    }
    const menuNeeds = {}
    items.forEach(i => { menuNeeds[i.id] = (menuNeeds[i.id] || 0) + Number(i.qty || 0) })
    const menuShort = Object.entries(menuNeeds).find(([id,qty]) => {
      const m = data.menu.find(x => x.id === id)
      return m && Number(m.stock || 0) > 0 && Number(m.stock || 0) < qty
    })
    if (menuShort) {
      const m = data.menu.find(x => x.id === menuShort[0])
      alert(`Insufficient ${m?.name || 'menu item'} stock. Available: ${m?.stock ?? 0}, requested: ${menuShort[1]}.`)
      return false
    }
    return true
  }
  const deductIngredients = items => {
    const needs = ingredientNeeds(items)
    return (data.ingredients || []).map(ing => needs[ing.id] ? { ...ing, stock: Math.max(0, Number(ing.stock||0)-needs[ing.id]) } : ing)
  }
  const deductStock = items => {
    const sold = {}
    items.forEach(i => { sold[i.id] = (sold[i.id] || 0) + Number(i.qty || 0) })
    return data.menu.map(m => sold[m.id] && Number(m.stock || 0) > 0
      ? { ...m, stock: Math.max(0, Number(m.stock || 0) - sold[m.id]) }
      : m)
  }
  const createOrder = ({ customer, customerPhone, items, paymentMethod, note }) => {
    if (!stockCheck(items)) return
    const priced = priceItems(items)
    const stamp = Date.now()
    const id = 'SP-' + String(stamp).slice(-6)
    const createdAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const subtotal = priced.reduce((sum, i) => sum + i.price * i.qty, 0)
    const taxRate = Number(data.restaurant?.taxRate || 0)
    const tax = subtotal * taxRate / 100
    const total = subtotal + tax
    const customerName = (customer || '').trim()
    const phone = (customerPhone || '').trim()
    const customerRecord = customerName || phone ? { id: 'C' + String(stamp).slice(-8), name: customerName || 'Customer', phone, visits: 1, totalSpent: total, lastVisit: today() } : null
    const existingCustomer = customerRecord?.phone ? (data.customers || []).find(c => c.phone === customerRecord.phone) : null
    const customers = customerRecord ? (existingCustomer
      ? (data.customers || []).map(c => c.id === existingCustomer.id ? { ...c, name: customerRecord.name, visits: Number(c.visits || 0) + 1, totalSpent: Number(c.totalSpent || 0) + total, lastVisit: today() } : c)
      : [...(data.customers || []), customerRecord]) : (data.customers || [])
    const order = {
      id, customerPhone: phone, invoiceNo: `${data.restaurant?.invoicePrefix || 'INV'}-${String(stamp).slice(-6)}`,
      date: today(), time: createdAt, type: 'Counter', tableId: null, tableName: null,
      customer: customerName, items: priced, batches: [], subtotal, taxRate, tax, total,
      status: 'Paid', paid: true, billRequested: false, billGenerated: Boolean(data.restaurant?.autoPrintBill),
      paymentMethod: paymentMethod || 'Cash', paidAt: createdAt, note: note || '',
      createdBy: session.name, restaurantName: data.restaurant?.name || 'Restaurant',
      restaurantAddress: data.restaurant?.address || '', restaurantPhone: data.restaurant?.phone || '',
      gstin: data.restaurant?.gstin || '', restaurantLogo: data.restaurant?.logo || ''
    }
    update({ menu: deductStock(items), ingredients: deductIngredients(items), customers, orders: [order, ...orders] })
    if (data.restaurant?.autoPrintBill) {
      setBillPreview(order)
      notify(`Order ${id} completed · customer bill is ready`)
    } else {
      notify(`Order ${id} completed · ${paymentMethod || 'Cash'} · stock updated`)
    }
  }
  const addItems = (orderId, items, note) => {
    if (!stockCheck(items)) return
    const priced = priceItems(items)
    const batchId = 'KOT-' + String(Date.now()).slice(-6)
    update({ menu: deductStock(items), ingredients: deductIngredients(items), orders: orders.map(o => o.id !== orderId ? o : (() => {
      const subtotal = Number(o.subtotal ?? o.total) + priced.reduce((sum, i) => sum + i.price * i.qty, 0)
      const taxRate = Number(o.taxRate ?? data.restaurant?.taxRate ?? 0)
      const tax = subtotal * taxRate / 100
      return { ...o, items: mergeItems(o.items, priced), subtotal, taxRate, tax, total: subtotal + tax, billRequested: false, billGenerated: false, batches: [...o.batches, { id: batchId, createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), items: priced.map(i => ({ ...i })), note: note || '', status: 'New', printed: false }] }
    })()) })
    setModal(null); notify(`Additional KOT ${batchId} sent to kitchen · stock updated`)
  }
  const patchBatch = (orderId, batchId, status) => setData(d => ({ ...d, orders: d.orders.map(o => o.id !== orderId ? o : ({ ...o, batches: o.batches.map(b => b.id === batchId ? { ...b, status } : b) })) }))
  const requestBill = id => { update({ orders: orders.map(o => o.id === id ? { ...o, billRequested: true, billGenerated: true, billRequestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : o) }); notify('Final bill generated and sent to billing counter') }
  const markPaid = (id, method) => {
    const order = orders.find(o => o.id === id)
    update({ orders: orders.map(o => o.id === id ? { ...o, status: 'Paid', paid: true, billRequested: false, paymentMethod: method, paidAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : o), tables: order?.tableId ? data.tables.map(t => t.id === order.tableId ? { ...t, status: 'Available', orderId: null } : t) : data.tables })
    notify(`${id} marked paid · table released`)
  }
  const saveTable = ({ id, name, seats }) => {
    if(id) update({ tables: data.tables.map(t => t.id===id ? {...t,name,seats} : t) })
    else { const nextId=Math.max(0,...data.tables.map(t=>Number(t.id)||0))+1; update({tables:[...data.tables,{id:nextId,name,seats,status:'Available',orderId:null}]}) }
    setModal(null); notify(id?'Table updated':'Table added')
  }

  return <div className="pos-app">
    <header className="pos-top">
      <div className="pos-brand"><div className="pos-brand-icon"><Utensils size={21}/></div><div><b>serve<span>pos</span></b><small>CAFE POS SYSTEM</small></div></div>
      <div className="top-restaurant"><b>{data.restaurant?.name || 'My Restaurant'}</b><small><i/> Owner workspace · Device database</small></div>
      <div className="top-user"><div>{session.name.split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase()}</div><span>{session.name} · Owner</span><button title="Sign out" onClick={logout}><LogOut size={16}/></button></div>
    </header>
    <div className="pos-layout">
      <aside className="pos-sidebar"><div className="side-label">CAFE MANAGEMENT</div>{[['Take Order',ShoppingBag],['Overview',LayoutDashboard],['Orders',ClipboardList],['Customers',Users],['Tables',Armchair],['Menu',Utensils],['Inventory',Boxes],['Ingredients',Package],['Expenses',CircleDollarSign],['Reports',BarChart3],['Settings',Settings]].map(([p,I]) => <button key={p} className={page === p ? 'side-link active' : 'side-link'} onClick={() => setPage(p)}><I size={17}/>{p}</button>)}<div className="side-tip"><b>Simple counter workflow</b><p>Take an order, choose payment and complete the sale. No waiter, kitchen or billing-counter steps.</p></div></aside>
      <main className="pos-main">
        <OwnerView page={page} data={data} orders={orders} todayOrders={todayOrders} todaySales={todaySales} activeDineIn={activeDineIn} setPage={setPage} setModal={setModal} notify={notify} update={update} setWorkspace={switchWorkspace} requestBill={requestBill} patchBatch={patchBatch} markPaid={markPaid} users={users} updateUsers={updateUsers} onCreateOrder={createOrder} syncToken={syncToken} setSyncToken={setSyncToken} autoSync={autoSync} setAutoSync={setAutoSync} cloudStatus={cloudStatus} cloudBusy={cloudBusy} cloudRevision={cloudRevision} lastSyncAt={lastSyncAt} onCloudUpload={manualCloudUpload} onCloudDownload={manualCloudDownload}/>
      </main>
    </div>
    {modal?.type === 'new' && <OrderModal data={data} initialType={modal.orderType || 'Dine-in'} onClose={() => setModal(null)} onCreate={createOrder}/>}
    {modal?.type === 'add' && <OrderModal data={data} initialType="Dine-in" existing={modal.order} onClose={() => setModal(null)} onCreate={createOrder} onAdd={addItems}/>}
    {modal?.type === 'staff' && <StaffModal data={data} users={users} update={update} updateUsers={updateUsers} onClose={() => setModal(null)} notify={notify}/>}
    {modal?.type === 'table' && <TableModal onClose={() => setModal(null)} onSave={saveTable} existingCount={data.tables.length} existing={modal.existing}/>}
    {billPreview && <BillPreviewModal order={{...billPreview,restaurantLogo:billPreview.restaurantLogo||data.restaurant?.logo||''}} onClose={() => setBillPreview(null)}/>}
    {localDbError && <div className="pos-storage-warning"><b>Local database warning:</b> {localDbError}. Export a backup before continuing.</div>}
    {toast && <div className="pos-toast"><Check size={17}/>{toast}</div>}
  </div>
}


function PasswordInput({ value, onChange, autoComplete, minLength, required }) {
  const [visible, setVisible] = useState(false)
  return <span className="password-input-wrap">
    <input type={visible ? 'text' : 'password'} value={value} onChange={onChange}
      autoComplete={autoComplete} minLength={minLength} required={required}/>
    <button type="button" className="password-visibility" aria-label={visible ? 'Hide password' : 'Show password'}
      title={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)}>
      {visible ? <EyeOff size={18}/> : <Eye size={18}/>}
    </button>
  </span>
}

function FirstRunSetup({ onCreate }) {
  const [form, setForm] = useState({ restaurantName: '', name: '', username: 'owner', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async e => {
    e.preventDefault(); setError('')
    if (!form.restaurantName.trim() || !form.name.trim() || !form.username.trim()) return setError('Please complete all fields.')
    if (form.password.length < 8) return setError('Use a password with at least 8 characters.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setBusy(true); await onCreate(form); setBusy(false)
  }
  return <AuthShell><form className="auth-card" onSubmit={submit}><div className="auth-logo"><Utensils size={25}/></div><small className="auth-kicker">FIRST-TIME SETUP</small><h1>Set up your restaurant</h1><p>Create the owner account to start configuring your POS. No sample menu, staff or tables are preloaded.</p>{error&&<div className="auth-error">{error}</div>}<label className="auth-field">Restaurant name<input value={form.restaurantName} onChange={e=>setForm({...form,restaurantName:e.target.value})} placeholder="e.g. The Urban Spoon" required/></label><label className="auth-field">Owner full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name" required/></label><label className="auth-field">Owner username<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoComplete="username" required/></label><label className="auth-field">Password<PasswordInput value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete="new-password" minLength="8" required/></label><label className="auth-field">Confirm password<PasswordInput value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})} autoComplete="new-password" required/></label><button className="pos-primary wide" disabled={busy}>{busy?'Creating owner account…':'Create owner account'}</button><small className="auth-footnote">This first version keeps accounts on this device. A secure shared backend is required before using separate devices.</small></form></AuthShell>
}
function LoginScreen({ users, onLogin }) {
  const [username,setUsername] = useState(''); const [password,setPassword] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false)
  const submit = async e => { e.preventDefault(); setBusy(true); const ok=await onLogin(username,password); setBusy(false); if(!ok)setError('Incorrect username or password, or this account is inactive.') }
  return <AuthShell><form className="auth-card login-card" onSubmit={submit}><div className="auth-logo"><Utensils size={25}/></div><small className="auth-kicker">RESTAURANT OPERATIONS</small><h1>Welcome back</h1><p>Sign in with the account created by your restaurant owner.</p>{error&&<div className="auth-error">{error}</div>}<label className="auth-field">Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required/></label><label className="auth-field">Password<PasswordInput value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label><button className="pos-primary wide" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><small className="auth-footnote">{users.length} account(s) configured on this device.</small></form></AuthShell>
}
function AuthShell({children}) { return <div className="auth-screen"><div className="auth-brand"><div className="pos-brand-icon"><Utensils size={21}/></div><div><b>serve<span>pos</span></b><small>RESTAURANT OPERATIONS</small></div></div>{children}<div className="auth-legal">ServePOS · Local-first restaurant management</div></div> }

function Heading({eyebrow,title,sub,action}) { return <div className="pos-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{sub}</p></div>{action}</div> }
function Stat({label,value,sub,icon:Icon,tone='blue'}) { return <div className="pos-stat"><div><span>{label}</span><b>{value}</b><small>{sub}</small></div><i className={tone}><Icon size={19}/></i></div> }
function Status({children}) { return <span className={'pos-status ' + String(children).toLowerCase().replaceAll(' ','-')}>{children}</span> }
function OwnerView({page,data,orders,todayOrders,todaySales,activeDineIn,setPage,setModal,notify,update,setWorkspace,requestBill,patchBatch,markPaid,users,updateUsers,onCreateOrder,syncToken,setSyncToken,autoSync,setAutoSync,cloudStatus,cloudBusy,cloudRevision,lastSyncAt,onCloudUpload,onCloudDownload}) {
  const occupied = data.tables.filter(t => t.status === 'Occupied').length
  if (page === 'Take Order') return <QuickOrderView data={data} onCreate={onCreateOrder} notify={notify}/>
  if (page === 'Overview') return <>
    <Heading eyebrow="CAFE OVERVIEW" title="Business dashboard" sub="A clear view of today's orders, sales, stock and profit." action={<button className="pos-primary" onClick={()=>setPage('Take Order')}><Plus size={16}/> Take new order</button>}/>
    <div className="pos-stats"><Stat label="Today's sales" value={money(todaySales)} sub={`${todayOrders.filter(o=>o.status==='Paid').length} completed orders`} icon={CircleDollarSign}/><Stat label="Total orders" value={orders.length} sub="All recorded orders" icon={ShoppingBag} tone="purple"/><Stat label="Customers" value={(data.customers||[]).length} sub="Saved customer profiles" icon={Users} tone="green"/><Stat label="Low stock items" value={data.menu.filter(m=>Number(m.stock)>0&&Number(m.stock)<=5).length+(data.ingredients||[]).filter(i=>Number(i.stock)<=Number(i.minStock||0)).length} sub="Menu items and ingredients" icon={Boxes} tone="orange"/></div>
    <section className="pos-card"><div className="pos-card-head"><div><h3>Recent orders</h3><p>Latest completed counter sales</p></div><button className="pos-link" onClick={()=>setPage('Orders')}>View all →</button></div><OrderTable orders={orders.slice(0,8)}/></section>
    <div className="owner-quick-grid"><button onClick={()=>setPage('Menu')}><Utensils/><span><b>Manage menu</b><small>Add items, prices, recipes and costs</small></span>→</button><button onClick={()=>setPage('Expenses')}><CircleDollarSign/><span><b>Record expenses</b><small>Track operating expenses and profit</small></span>→</button></div>
  </>
  if (page === 'Orders') return <><Heading eyebrow="SALES HISTORY" title="All orders" sub="Every completed counter order, payment method and customer." action={<button className="pos-primary" onClick={()=>setPage('Take Order')}><Plus size={16}/> New order</button>}/><section className="pos-card"><OrderTable orders={orders}/></section></>
  if (page === 'Tables') return <><Heading eyebrow="FLOOR MANAGEMENT" title="Tables" sub="Add your real restaurant tables and monitor availability." action={<button className="pos-primary" onClick={()=>setModal({type:'table'})}><Plus size={16}/> Add table</button>}/><section className="pos-card">{data.tables.length?<div className="owner-table-grid large">{data.tables.map(t=>{const o=orders.find(o=>o.id===t.orderId&&o.status!=='Paid');return <div className={t.status==='Occupied'?'owner-table busy':'owner-table'}><b>{t.name}</b><Armchair size={24}/><small>{t.status}</small><em>{t.seats} seats</em>{o&&<strong>{o.id} · {money(o.total)}</strong>}<div className="row-actions"><button className="pos-secondary" onClick={()=>setModal({type:'table',existing:t})}>Edit</button><button className="pos-danger" disabled={t.status==='Occupied'} onClick={()=>{if(confirm(`Delete ${t.name}?`))update({tables:data.tables.filter(x=>x.id!==t.id)})}}>Delete</button></div></div>})}</div>:<Empty title="No tables added yet" sub="Use Add table to create the tables in your restaurant."/>}</section></>
  if (page === 'Menu') return <MenuOwner data={data} update={update} notify={notify}/>
  if (page === 'Inventory') return <InventoryOwner data={data} update={update}/>
  if (page === 'Ingredients') return <IngredientsOwner data={data} update={update} notify={notify}/>
  if (page === 'Customers') return <CustomersOwner data={data} orders={orders}/>
  if (page === 'Expenses') return <ExpensesOwner data={data} update={update} notify={notify}/>
  if (page === 'Reports') return <ReportsOwner orders={orders} data={data}/>
  return <SettingsOwner data={data} update={update} notify={notify} users={users} updateUsers={updateUsers} syncToken={syncToken} setSyncToken={setSyncToken} autoSync={autoSync} setAutoSync={setAutoSync} cloudStatus={cloudStatus} cloudBusy={cloudBusy} cloudRevision={cloudRevision} lastSyncAt={lastSyncAt} onCloudUpload={onCloudUpload} onCloudDownload={onCloudDownload}/>
}
function OrderTable({orders}) { return <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>ORDER / CUSTOMER</th><th>TYPE / PAYMENT</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th><th>BILL</th></tr></thead><tbody>{orders.length?orders.map(o=><tr><td><b>{o.id}</b><small>{o.customer||'Walk-in customer'} · {o.time}</small></td><td>{o.type==='Counter'?'Counter sale':o.type}<small>{o.paymentMethod||'—'}</small></td><td>{o.items.reduce((s,i)=>s+i.qty,0)} qty</td><td><b>{money(o.total)}</b></td><td><Status>{o.status==='Paid'?'Paid':o.billRequested?'Bill requested':o.status}</Status></td><td>{o.billRequested?'Requested':o.status==='Paid'?'Paid':'—'}</td></tr>):<tr><td colSpan="6" className="pos-empty">No orders recorded yet.</td></tr>}</tbody></table></div> }
function WaiterView({data,orders,setModal,addItems,requestBill,patchBatch}) { const [filter,setFilter]=useState('Active');const list=orders.filter(o=>o.type==='Dine-in'&&o.status!=='Paid'&&(filter==='All'||(filter==='Active'&&!o.billRequested)||(filter==='Bills'&&o.billRequested)));return <><Heading eyebrow="SERVICE TEAM" title="Waiter station" sub="Open a table, take orders, add items and request the final bill." action={<button className="pos-primary" onClick={()=>setModal({type:'new',orderType:'Dine-in'})}><Plus size={17}/> Take table order</button>}/><div className="pos-role-banner waiter"><ConciergeBell size={21}/><span><b>Waiter workspace</b><small>New orders and additional items are sent to the kitchen as separate KOT tickets.</small></span></div><div className="pos-tabs">{['Active','Bills','All'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)}>{x}</button>)}</div><div className="pos-order-cards">{list.map(o=><article className="service-order"><div className="service-order-head"><div><span className="table-chip">{o.tableName}</span><b>{o.id}</b><small>{o.time} · {o.customer||'Dine-in guest'}</small></div><Status>{o.billRequested?'Bill requested':o.status}</Status></div><div className="service-items">{o.items.map(i=><div><span>{i.name}</span><b>× {i.qty}</b></div>)}</div><div className="service-batches"><b>KOT progress</b>{o.batches.map(b=><span>{b.id}: {b.status}{b.status==='Ready'&&<button className="serve-inline" onClick={()=>patchBatch(o.id,b.id,'Served')}>Mark served</button>}</span>)}</div><div className="service-order-foot"><b>{money(o.total)}</b><div><button className="pos-secondary" onClick={()=>setModal({type:'add',order:o})}><Plus size={14}/> Add items</button><button className="pos-primary" onClick={()=>requestBill(o.id)} disabled={o.billRequested||!o.batches.every(b=>b.status==='Served')}><Receipt size={14}/> {o.billRequested?'Bill requested':o.batches.every(b=>b.status==='Served')?'Request final bill':'Serve all items first'}</button></div></div></article>)}</div>{!list.length&&<Empty title="No dine-in orders here" sub="Orders assigned to your tables will appear here."/>}</> }
function KitchenView({orders,patchBatch}) { const tickets=orders.filter(o=>o.type==='Dine-in'||o.type==='Parcel').flatMap(o=>o.batches.filter(b=>b.status==='New'||b.status==='Preparing').map(b=>({order:o,batch:b}))).sort((a,b)=>a.batch.id.localeCompare(b.batch.id));return <><Heading eyebrow="KITCHEN DISPLAY SYSTEM" title="Kitchen order queue" sub="Prepare each KOT batch and mark it ready when food is complete."/><div className="pos-role-banner kitchen"><ChefHat size={22}/><span><b>Kitchen display · KDS</b><small>Each new order or waiter add-on arrives as its own ticket. Completed tickets move to Ready.</small></span><span className="queue-count">{tickets.length} pending</span></div><div className="ticket-grid">{tickets.map(({order,batch})=><Ticket order={order} batch={batch} onStatus={status=>patchBatch(order.id,batch.id,status)} />)}</div>{!tickets.length&&<Empty title="Kitchen is clear" sub="New KOT tickets will appear here automatically."/>}</> }
function Ticket({order,batch,onStatus}) { return <article className="kot-ticket"><div className="kot-top"><div><small>{batch.id}</small><h3>{order.type==='Parcel'?'PARCEL ORDER':order.tableName}</h3><span>{order.id} · {batch.createdAt}</span></div><Status>{batch.status}</Status></div><div className="kot-items">{batch.items.map(i=><div><b>{i.qty} ×</b><span>{i.name}</span></div>)}</div>{batch.note&&<div className="kot-note">Note: {batch.note}</div>}<div className="kot-actions"><button className="pos-secondary" onClick={()=>printTicket(order,batch,'KITCHEN KOT')}><Printer size={14}/> Print KOT</button>{batch.status==='New'?<button className="pos-primary" onClick={()=>onStatus('Preparing')}>Start preparing</button>:<button className="pos-primary ready-btn" onClick={()=>onStatus('Ready')}><Check size={14}/> Mark ready</button>}</div></article> }
function ParcelView({orders,patchBatch,setModal,requestBill}) {
  const list=orders.filter(o=>o.type==='Parcel'&&o.status!=='Paid')
  return <><Heading eyebrow="TAKEAWAY OPERATIONS" title="Parcel desk" sub="Take direct takeaway orders, receive packed food from kitchen and generate the customer bill." action={<button className="pos-primary" onClick={()=>setModal({type:'new',orderType:'Parcel'})}><Plus size={16}/> Create parcel order</button>}/><div className="pos-role-banner parcel"><Package size={22}/><span><b>Parcel counter workspace</b><small>New parcel orders go to kitchen first. Kitchen marks each KOT ready; parcel staff receives, packs and generates the bill.</small></span><span className="queue-count">{list.length} open</span></div><div className="ticket-grid">{list.map(o=>{
    const batches=o.batches||[]
    const waiting=batches.filter(b=>b.status==='New'||b.status==='Preparing')
    const ready=batches.filter(b=>b.status==='Ready')
    const allCollected=batches.length>0&&batches.every(b=>b.status==='Collected')
    return <article className="kot-ticket parcel-ticket" key={o.id}><div className="kot-top"><div><small>{o.id}</small><h3>{o.customer||'Walk-in parcel'}</h3><span>Placed at {o.time} · Parcel takeaway</span></div><Status>{o.billRequested?'Bill generated':waiting.length?'Kitchen preparing':ready.length?'Ready at kitchen':'Packing / billing'}</Status></div><div className="kot-items">{o.items.map(i=><div key={i.id}><b>{i.qty} ×</b><span>{i.name}</span></div>)}</div><div className="parcel-progress"><span>Kitchen: {waiting.length?'In progress':ready.length?'Ready for collection':'Completed'}</span><span>Parcel desk: {allCollected?'Received':ready.length?'Awaiting collection':'—'}</span></div><div className="parcel-total">Order total <b>{money(o.total)}</b></div><div className="kot-actions">
      <button className="pos-secondary" onClick={()=>printTicket(o,null,'PARCEL PACKING SLIP')}><Printer size={14}/> Print packing slip</button>
      {ready.length>0?<button className="pos-primary ready-btn" onClick={()=>ready.forEach(b=>patchBatch(o.id,b.id,'Collected'))}><Check size={14}/> Received from kitchen ({ready.length})</button>:null}
      {allCollected&&!o.billRequested?<button className="pos-primary" onClick={()=>{requestBill(o.id);setTimeout(()=>printTicket(o,null,'PARCEL CUSTOMER BILL'),100)}}><Receipt size={14}/> Generate & print bill</button>:null}
      {o.billRequested?<button className="pos-secondary" onClick={()=>printTicket(o,null,'PARCEL CUSTOMER BILL')}><Printer size={14}/> Reprint customer bill</button>:null}
      {waiting.length>0&&<span className="muted-note">Waiting for kitchen to mark food ready</span>}
    </div></article>
  })}</div>{!list.length&&<Empty title="No parcel orders" sub="Create a parcel order here or let the owner create one from the owner dashboard."/>}</>
}
function CashierView({orders,markPaid,restaurant={}}) {
 const [method,setMethod]=useState('Cash'),[query,setQuery]=useState('')
 const bills=orders.filter(o=>o.status!=='Paid'&&o.billRequested&&(`${o.id} ${o.customer} ${o.tableName||''}`).toLowerCase().includes(query.toLowerCase()))
 const launchUPI=o=>{
  if(!restaurant.upiId)return alert('Owner must add the restaurant UPI ID in Settings first.')
  const params=new URLSearchParams({pa:restaurant.upiId,pn:restaurant.name||'Restaurant',am:Number(o.total).toFixed(2),cu:'INR',tn:`Invoice ${o.invoiceNo||o.id}`})
  window.location.href=`upi://pay?${params.toString()}`
 }
 return <><Heading eyebrow="PAYMENTS & BILLING" title="Counter billing" sub="Collect cash, UPI or card payment and close the table."/><div className="pos-role-banner cashier"><CreditCard size={22}/><span><b>Cashier workspace</b><small>Only bill-requested orders appear in the payment queue.</small></span><span className="queue-count">{bills.length} bills waiting</span></div><div className="pos-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search order ID, customer or table"/></div><div className="pos-order-cards">{bills.map(o=><article className="bill-card"><div className="bill-info"><div><small>{o.id}</small><h3>{o.customer||'Walk-in customer'}</h3><span>{o.type} · {o.tableName||'Parcel'} · {o.time}</span></div><strong>{money(o.total)}</strong></div><div className="bill-items">{o.items.map(i=><span>{i.name} × {i.qty}</span>)}</div><div className="bill-pay"><button className="pos-secondary" onClick={()=>printTicket(o,null,'CUSTOMER BILL')}><Printer size={14}/> Print customer bill</button><label>Payment method<select value={method} onChange={e=>setMethod(e.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Other</option></select></label>{method==='UPI'&&<button className="pos-secondary" onClick={()=>launchUPI(o)}>Open UPI payment app</button>}<button className="pos-primary" onClick={()=>{if(confirm(`Confirm ${money(o.total)} received via ${method} for ${o.id}? Only confirm after payment is actually received.`))markPaid(o.id,method)}}><Check size={15}/> Payment received · Mark paid</button></div>{method==='UPI'&&<p className="modal-help">UPI ID: {restaurant.upiId||'Not configured — add it in Owner → Settings.'} · Open the UPI app, verify payment in your merchant account, then mark as paid.</p>}</article>)}</div>{!bills.length&&<Empty title="No bills waiting" sub="When a waiter requests the final bill, it will appear here."/>}</>
}

function BillPreviewModal({order,onClose}) {
 const subtotal=Number(order.subtotal??order.total??0)
 const tax=Number(order.tax||0)
 const total=Number(order.total||subtotal+tax)
 const printBill=()=>printTicket(order,null,'CUSTOMER BILL')
 return <div className="pos-overlay bill-preview-overlay" role="dialog" aria-modal="true" aria-label="Customer bill preview">
   <div className="bill-preview-modal">
     <div className="bill-preview-head"><div><small>BILL GENERATED</small><h2>Customer bill preview</h2><p>Review the bill before printing.</p></div><button className="bill-close-icon" onClick={onClose} aria-label="Close bill preview"><X size={19}/></button></div>
     <div className="bill-preview-scroll"><div className="bill-preview-paper">
       {order.restaurantLogo&&<img className="bill-preview-logo" src={order.restaurantLogo} alt="Restaurant logo"/>}
       <h2>{order.restaurantName||'Restaurant'}</h2>
       {(order.restaurantAddress||order.restaurantPhone||order.gstin)&&<p className="bill-preview-address">{order.restaurantAddress}{order.restaurantPhone?` · ${order.restaurantPhone}`:''}{order.gstin?` · GSTIN: ${order.gstin}`:''}</p>}
       <div className="bill-preview-kicker">CUSTOMER BILL</div>
       <div className="bill-preview-meta"><span>Invoice<strong>{order.invoiceNo||order.id}</strong></span><span>Order<strong>{order.id}</strong></span><span>Customer<strong>{order.customer||'Walk-in customer'}</strong></span><span>Payment<strong>{order.paymentMethod||'Cash'}</strong></span><span>Date<strong>{order.date||'—'}</strong></span><span>Time<strong>{order.time||'—'}</strong></span></div>
       <div className="bill-preview-items"><div className="bill-preview-table-head"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>{(order.items||[]).map((item,index)=><div className="bill-preview-item" key={`${item.id||item.name}-${index}`}><span><b>{item.name}</b><small>{money(item.price)} each</small></span><b>{item.qty}</b><strong>{money(Number(item.price||0)*Number(item.qty||0))}</strong></div>)}</div>
       <div className="bill-preview-total"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{Number(order.taxRate||0)>0&&<div><span>GST ({Number(order.taxRate).toFixed(2)}%)</span><b>{money(tax)}</b></div>}<div className="bill-preview-grand"><span>Grand total</span><strong>{money(total)}</strong></div></div>
       <div className="bill-preview-paid">PAID · {(order.paymentMethod||'CASH').toUpperCase()}</div><div className="bill-preview-thanks">Thank you for visiting!<small>We hope to serve you again.</small></div>
     </div></div>
     <div className="bill-preview-actions"><button className="pos-secondary" onClick={onClose}><X size={16}/> Close</button><button className="pos-primary" onClick={printBill}><Printer size={16}/> Print bill</button></div>
   </div>
 </div>
}

function printTicket(order,batch,title) {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 const bill=String(title).toLowerCase().includes('bill')
 const rows=(batch?.items||order.items).map(i=>`<tr><td><b>${esc(i.name)}</b></td><td class="num">${i.qty}</td>${bill?`<td class="num">${money(i.price)}</td><td class="num">${money(i.price*i.qty)}</td>`:''}</tr>`).join('')
 const restaurant=esc(order.restaurantName||'Restaurant')
 const subtotal=Number(order.subtotal??order.total??0), tax=Number(order.tax||0), total=Number(order.total||subtotal+tax)
 const taxLine=Number(order.taxRate||0)>0?`<div class="sumrow"><span>GST (${Number(order.taxRate).toFixed(2)}%)</span><b>${money(tax)}</b></div>`:''
 const totals=bill?`<div class="totals"><div class="sumrow"><span>Subtotal</span><b>${money(subtotal)}</b></div>${taxLine}<div class="sumrow grand"><span>TOTAL</span><b>${money(total)}</b></div></div>`:''
 const logo=order.restaurantLogo?`<img class="logo" src="${esc(order.restaurantLogo)}" alt="Restaurant logo"/>`:''
 const w=window.open('','_blank','width=480,height=760')
 if(!w)return alert('Please allow pop-ups to print.')
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(order.invoiceNo||order.id)}</title><style>
 *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#151515;padding:18px;max-width:420px;margin:auto}
 .brand{text-align:center}.logo{width:auto;height:auto;max-width:92px;max-height:72px;object-fit:contain;display:block;margin:0 auto 8px}
 h1{font-size:21px;text-align:center;margin:0 0 5px;letter-spacing:.2px}h2{font-size:14px;text-align:center;margin:6px 0 10px;letter-spacing:1.5px}
 .center{text-align:center;line-height:1.55;color:#444;font-size:11px}.rule{border:0;border-top:1px dashed #777;margin:12px 0}
 .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:10px;color:#444}.meta span:nth-child(even){text-align:right}
 table{width:100%;border-collapse:collapse;margin-top:12px}th{text-align:left;font-size:9px;letter-spacing:.6px;border-bottom:1px solid #222;padding:7px 2px}
 td{padding:8px 2px;border-bottom:1px dotted #bbb;vertical-align:top;font-size:11px}.num{text-align:right;white-space:nowrap}
 .totals{margin:12px 0 0 auto;width:78%}.sumrow{display:flex;justify-content:space-between;padding:5px 0;font-size:11px}.grand{font-size:16px;font-weight:700;border-top:1px solid #222;margin-top:5px;padding-top:9px}
 .footer{text-align:center;margin-top:20px;line-height:1.6;font-weight:600}.muted{font-size:10px;color:#555;font-weight:400}
 @media print{body{padding:5px;width:100%;max-width:none}@page{margin:5mm}}
 </style></head><body>
 <div class="brand">${logo}<h1>${restaurant}</h1><div class="center">${esc(order.restaurantAddress)}${order.restaurantPhone?`<br/>Phone: ${esc(order.restaurantPhone)}`:''}${order.gstin?`<br/><b>GSTIN: ${esc(order.gstin)}</b>`:''}</div></div>
 <hr class="rule"/><h2>${esc(title)}</h2>
 <div class="meta"><span>Order: ${esc(order.id)}</span><span>Invoice: ${esc(order.invoiceNo||order.id)}</span><span>Customer: ${esc(order.customer||'Walk-in')}</span><span>${esc(order.type==='Dine-in'?(order.tableName||'Dine-in'):order.type==='Counter'?'Counter sale':'Takeaway')}</span><span>Date: ${esc(order.date||'')}</span><span>Time: ${esc(order.time||'')}</span>${batch?`<span>KOT: ${esc(batch.id)}</span>`:''}</div>
 <table><thead><tr><th>ITEM</th><th class="num">QTY</th>${bill?'<th class="num">RATE</th><th class="num">AMOUNT</th>':''}</tr></thead><tbody>${rows}</tbody></table>
 ${batch?.note?`<p class="muted">Instruction: ${esc(batch.note)}</p>`:''}${totals}
 <div class="footer">${bill?`THANK YOU!<br/><span class="muted">We appreciate your visit.</span>`:'Kitchen copy · Prepare as per instructions'}</div>
 <hr class="rule"/><div class="center muted">Powered by ServePOS</div>
 <script>
 window.addEventListener('load',async()=>{
   const imgs=Array.from(document.images)
   await Promise.all(imgs.map(img=>{
     if(img.complete&&img.naturalWidth>0)return Promise.resolve()
     if(typeof img.decode==='function')return img.decode().catch(()=>{})
     return new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,2500)})
   }))
   window.focus()
   window.print()
 })
 </script></body></html>`)
 w.document.close()
}
function OrderModal({data,initialType,existing,onClose,onCreate,onAdd}) { const [type,setType]=useState(existing?'Dine-in':initialType);const [tableId,setTableId]=useState(existing?.tableId||'');const [customer,setCustomer]=useState(existing?.customer||'');const [customerPhone,setCustomerPhone]=useState(existing?.customerPhone||'');const [note,setNote]=useState('');const [cart,setCart]=useState([]);const [cat,setCat]=useState('All Items');const [search,setSearch]=useState('');const available=data.menu.filter(m=>m.active&&(cat==='All Items'||m.category===cat)&&m.name.toLowerCase().includes(search.toLowerCase()));const total=cart.reduce((s,i)=>s+i.price*i.qty,0);const add=m=>setCart(c=>{const f=c.find(x=>x.id===m.id);return f?c.map(x=>x.id===m.id?{...x,qty:x.qty+1}:x):[...c,{id:m.id,name:m.name,price:m.price,qty:1,emoji:m.emoji}]});const qty=(id,d)=>setCart(c=>c.map(x=>x.id===id?{...x,qty:x.qty+d}:x).filter(x=>x.qty>0));const submit=()=>{if(!cart.length)return;if(type==='Dine-in'&&!existing&&!tableId)return alert('Please choose a free table');if(type==='Parcel'&&!customer.trim())return alert('Please enter the customer name for parcel order');if(existing)onAdd(existing.id,cart,note);else onCreate({type,tableId:type==='Dine-in'?Number(tableId):null,customer,customerPhone,items:cart,note})};return <div className="pos-overlay"><div className="pos-order-modal"><div className="pos-modal-head"><div><small>{existing?'ADD-ON ORDER':'NEW SERVICE ORDER'}</small><h2>{existing?`Add items · ${existing.tableName}`:'Create order'}</h2></div><button onClick={onClose}><X/></button></div><div className="pos-modal-body"><div className="menu-picker"><div className="pos-type-tabs">{!existing&&['Dine-in','Parcel'].map(t=><button className={type===t?'selected':''} onClick={()=>setType(t)}>{t==='Dine-in'?<Armchair size={15}/>:<Package size={15}/>} {t}</button>)}</div>{type==='Dine-in'&&!existing&&<label className="pos-field">Select available table<select value={tableId} onChange={e=>setTableId(e.target.value)}><option value="">Choose table</option>{data.tables.filter(t=>t.status==='Available').map(t=><option value={t.id}>{t.name} · {t.seats} seats</option>)}</select></label>}{!existing&&<><label className="pos-field">Customer name {type==='Parcel'?'(required)':'(optional)'}<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Customer name" required={type==='Parcel'}/></label><label className="pos-field">Customer mobile (optional)<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="10-digit mobile number" inputMode="numeric" maxLength={10}/></label></>}<div className="pos-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu items"/></div><div className="pos-tabs">{data.categories.map(c=><button className={cat===c?'selected':''} onClick={()=>setCat(c)}>{c}</button>)}</div><div className="pick-grid">{available.map(m=><button onClick={()=>add(m)}><span>{m.emoji}</span><b>{m.name}</b><small>{money(m.price)}</small><Plus size={15}/></button>)}</div></div><div className="cart-picker"><h3>Order items <small>{cart.reduce((s,i)=>s+i.qty,0)} qty</small></h3>{cart.length?cart.map(i=><div className="cart-line"><span>{i.name}<small>{money(i.price)}</small></span><div><button onClick={()=>qty(i.id,-1)}><Minus size={12}/></button><b>{i.qty}</b><button onClick={()=>qty(i.id,1)}><Plus size={12}/></button></div><strong>{money(i.qty*i.price)}</strong></div>):<div className="cart-blank">Select items from the menu to begin.</div>}<label className="pos-field">Kitchen instructions<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Less spicy, no onion..."/></label><div className="cart-grand"><span>{existing?'Additional amount':'Order total'}</span><b>{money(total)}</b></div><button className="pos-primary wide" disabled={!cart.length} onClick={submit}>{existing?'Send additional KOT':'Send order to kitchen'} <span>→</span></button></div></div></div></div> }
function QuickOrderView({data,onCreate,notify}) {
  const [customer,setCustomer]=useState('')
  const [phone,setPhone]=useState('')
  const [paymentMethod,setPaymentMethod]=useState('Cash')
  const [cart,setCart]=useState([])
  const [category,setCategory]=useState('All Items')
  const [search,setSearch]=useState('')
  const [note,setNote]=useState('')
  const categories=['All Items',...(data.categories||[]).filter(c=>c!=='All Items')]
  const available=(data.menu||[]).filter(m=>m.active!==false&&(category==='All Items'||m.category===category)&&m.name.toLowerCase().includes(search.toLowerCase()))
  const subtotal=cart.reduce((sum,i)=>sum+Number(i.price)*Number(i.qty),0)
  const taxRate=Number(data.restaurant?.taxRate||0)
  const tax=subtotal*taxRate/100
  const total=subtotal+tax
  const add=item=>setCart(current=>{const found=current.find(x=>x.id===item.id);return found?current.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...current,{id:item.id,name:item.name,price:Number(item.price),cost:Number(item.cost||0),qty:1,emoji:item.emoji}]})
  const changeQty=(id,delta)=>setCart(current=>current.map(x=>x.id===id?{...x,qty:x.qty+delta}:x).filter(x=>x.qty>0))
  const complete=()=>{
    if(!cart.length)return
    onCreate({customer,customerPhone:phone,items:cart,paymentMethod,note})
    setCustomer('');setPhone('');setCart([]);setNote('');setPaymentMethod('Cash');setCategory('All Items');setSearch('')
  }
  return <>
    <Heading eyebrow="QUICK POS" title="Take a new order" sub="Select items, adjust quantities, choose payment and complete the sale." action={<span className="live-pill">● READY TO TAKE ORDER</span>}/>
    <div className="quick-pos-layout">
      <section className="pos-card quick-menu-card">
        <div className="quick-customer-fields">
          <label className="pos-field">Customer name <span className="muted-note">(optional)</span><input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Walk-in customer or name"/></label>
          <label className="pos-field">Mobile number <span className="muted-note">(optional)</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Customer mobile" inputMode="numeric" maxLength={10}/></label>
        </div>
        <div className="pos-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu items..."/></div>
        <div className="pos-tabs quick-category-tabs">{categories.map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="pick-grid quick-pick-grid">{available.map(m=><button key={m.id} onClick={()=>add(m)}><span>{m.emoji||'🍽️'}</span><b>{m.name}</b><small>{money(m.price)}</small><Plus size={15}/></button>)}</div>
        {!available.length&&<Empty title="No menu items found" sub="Add menu items in Menu or change your search."/>}
      </section>
      <section className="pos-card quick-cart-card">
        <div className="pos-card-head"><div><h3>Current order</h3><p>{cart.reduce((sum,i)=>sum+i.qty,0)} items in cart</p></div><button className="pos-link" onClick={()=>setCart([])} disabled={!cart.length}>Clear cart</button></div>
        <div className="quick-cart-lines">{cart.length?cart.map(i=><div className="cart-line quick-cart-line" key={i.id}><span><b>{i.name}</b><small>{money(i.price)} each</small></span><div><button onClick={()=>changeQty(i.id,-1)}><Minus size={12}/></button><b>{i.qty}</b><button onClick={()=>changeQty(i.id,1)}><Plus size={12}/></button></div><strong>{money(i.price*i.qty)}</strong></div>):<div className="cart-blank">Your cart is empty. Select menu items to start an order.</div>}</div>
        <label className="pos-field quick-note-field">Order note (optional)<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Any customer request..." rows="2"/></label>
        <div className="quick-payment"><label className="pos-field">Payment type<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Other</option></select></label></div>
        <div className="quick-totals"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{taxRate>0&&<div><span>Tax ({taxRate}%)</span><b>{money(tax)}</b></div>}<div className="quick-grand"><span>Total to collect</span><b>{money(total)}</b></div></div>
        <button className="pos-primary wide quick-complete" disabled={!cart.length} onClick={complete}><Check size={17}/> Complete order & save</button>
        <p className="modal-help">Order is saved as paid using the selected payment type. Stock, customer history and sales reports update automatically.</p>
      </section>
    </div>
  </>
}

function TableModal({onClose,onSave,existingCount,existing}) {
 const [name,setName]=useState(existing?.name||`T${String(existingCount+1).padStart(2,'0')}`)
 const [seats,setSeats]=useState(String(existing?.seats||4))
 return <SimpleModal title={existing?'Edit restaurant table':'Add restaurant table'} onClose={onClose}><div className="pos-form-grid"><label className="pos-field">Table name / number<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. T01"/></label><label className="pos-field">Seating capacity<input type="number" min="1" max="30" value={seats} onChange={e=>setSeats(e.target.value)}/></label></div><button className="pos-primary wide" onClick={()=>{if(!name.trim()||Number(seats)<1)return;onSave({id:existing?.id,name:name.trim(),seats:Number(seats)})}}>{existing?'Save changes':'Save table'}</button></SimpleModal>
}
function Empty({title,sub}) { return <div className="pos-empty-state"><ClipboardList size={32}/><b>{title}</b><span>{sub}</span></div> }
function MenuOwner({data,update,notify}) {
 const blank={name:'',category:'Main Course',price:'',cost:'',stock:'0',emoji:'🍽️',sku:'',recipe:[]}
 const [f,setF]=useState(blank),[recipeRows,setRecipeRows]=useState([]),[editing,setEditing]=useState(null)
 const [showForm,setShowForm]=useState(false)
 const recipeCost=recipeRows.reduce((sum,r)=>{const ing=(data.ingredients||[]).find(x=>x.id===r.ingredientId);return sum+(ing?Number(r.qty||0)*Number(ing.unitCost||0):0)},0)
 const price=Number(f.price||0),cost=recipeRows.length?recipeCost:Number(f.cost||0),profit=price-cost,margin=price>0?profit/price*100:0
 const startAdd=()=>{setEditing(null);setF(blank);setRecipeRows([]);setShowForm(true)}
 const startEdit=m=>{setEditing(m.id);setF({...blank,...m,price:String(m.price),cost:String(m.cost||0),stock:String(m.stock||0)});setRecipeRows((m.recipe||[]).map(r=>({ingredientId:r.ingredientId,qty:String(r.qty)})));setShowForm(true)}
 const save=()=>{
  if(!f.name.trim()||price<=0||Number(f.stock)<0||Number(f.cost)<0)return notify('Enter a name, valid selling price, cost and stock')
  const item={...f,id:editing||'m'+Date.now(),price,cost,stock:Number(f.stock),recipe:recipeRows.filter(r=>r.ingredientId&&Number(r.qty)>0).map(r=>({ingredientId:r.ingredientId,qty:Number(r.qty)})),active:editing?(data.menu.find(m=>m.id===editing)?.active??true):true}
  update({menu:editing?data.menu.map(m=>m.id===editing?item:m):[...data.menu,item]})
  setShowForm(false);setEditing(null);notify(editing?'Menu item updated':'Menu item added')
 }
 const remove=m=>{if((data.orders||[]).some(o=>o.status!=='Paid'&&o.items?.some(i=>i.id===m.id)))return notify('This item is present in an active order. Complete that order before deleting it.');if(confirm(`Delete ${m.name} from menu?`))update({menu:data.menu.filter(x=>x.id!==m.id)})}
 return <><Heading eyebrow="MENU CONFIGURATION" title="Menu & item economics" sub="Add, edit or remove menu items and configure each serving recipe." action={<button className="pos-primary" onClick={startAdd}><Plus size={16}/> Add menu item</button>}/>
 <div className="pos-stats"><Stat label="Menu items" value={data.menu.length} sub="Configured products" icon={Utensils}/><Stat label="Active items" value={data.menu.filter(m=>m.active).length} sub="Available for ordering" icon={Check} tone="green"/><Stat label="Low stock items" value={data.menu.filter(m=>Number(m.stock)<=5).length} sub="At or below 5 units" icon={Boxes} tone="orange"/></div>
 <section className="pos-card"><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>ITEM</th><th>SELL PRICE</th><th>UNIT COST</th><th>PROFIT / UNIT</th><th>GROSS MARGIN</th><th>STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{data.menu.length?data.menu.map(m=>{const p=Number(m.price||0),c=(m.recipe||[]).length?m.recipe.reduce((sum,r)=>{const ing=(data.ingredients||[]).find(x=>x.id===r.ingredientId);return sum+(ing?Number(r.qty||0)*Number(ing.unitCost||0):0)},0):Number(m.cost||0),gp=p-c,gm=p>0?gp/p*100:0;return <tr key={m.id}><td>{m.emoji} <b>{m.name}</b><small>{m.category}{m.sku?` · ${m.sku}`:''}</small></td><td>{money(p)}</td><td>{money(c)}</td><td><b className={gp>=0?'profit-positive':'profit-negative'}>{money(gp)}</b></td><td><span className="margin-pill">{gm.toFixed(1)}%</span></td><td>{m.stock}</td><td><button className="pos-secondary" onClick={()=>update({menu:data.menu.map(x=>x.id===m.id?{...x,active:!x.active}:x)})}>{m.active?'Available':'Hidden'}</button></td><td><div className="row-actions"><button className="pos-secondary" onClick={()=>startEdit(m)}>Edit</button><button className="pos-danger" onClick={()=>remove(m)}>Delete</button></div></td></tr>}):<tr><td colSpan="8" className="pos-empty">No menu items yet. Add your first dish.</td></tr>}</tbody></table></div></section>
 {showForm&&<SimpleModal title={editing?'Edit menu item':'Add menu item'} onClose={()=>setShowForm(false)}><div className="pos-form-grid"><label className="pos-field">Item name<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label className="pos-field">SKU / code<input value={f.sku||''} onChange={e=>setF({...f,sku:e.target.value})}/></label><label className="pos-field">Category<select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{data.categories.filter(c=>c!=='All Items').map(c=><option key={c}>{c}</option>)}</select></label><label className="pos-field">Selling price (₹)<input type="number" min="0" step="0.01" value={f.price} onChange={e=>setF({...f,price:e.target.value})}/></label><label className="pos-field">Direct cost per item (₹)<input type="number" min="0" step="0.01" value={f.cost} onChange={e=>setF({...f,cost:e.target.value})}/></label><label className="pos-field">Finished stock (legacy, if no recipe)<input type="number" min="0" step="1" value={f.stock} onChange={e=>setF({...f,stock:e.target.value})}/></label></div>
 <div className="recipe-builder"><div className="recipe-head"><b>Recipe / ingredients per serving</b><button type="button" className="pos-secondary" onClick={()=>setRecipeRows([...recipeRows,{ingredientId:(data.ingredients||[])[0]?.id||'',qty:'1'}])}><Plus size={14}/> Add ingredient</button></div>{recipeRows.map((r,index)=><div className="recipe-row" key={index}><select value={r.ingredientId} onChange={e=>setRecipeRows(recipeRows.map((x,i)=>i===index?{...x,ingredientId:e.target.value}:x))}><option value="">Select ingredient</option>{(data.ingredients||[]).map(ing=><option value={ing.id}>{ing.name} ({ing.unit})</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="Qty / serving" value={r.qty} onChange={e=>setRecipeRows(recipeRows.map((x,i)=>i===index?{...x,qty:e.target.value}:x))}/><button type="button" className="round-btn" onClick={()=>setRecipeRows(recipeRows.filter((_,i)=>i!==index))}>×</button></div>)}{!data.ingredients?.length&&<p className="modal-help">Add ingredients first from the Ingredients section.</p>}<small>Recipe cost per serving: <b>{money(recipeCost)}</b>. Quantities use each ingredient's base unit.</small></div>
 <div className="margin-preview"><div><small>PROFIT / ITEM</small><b>{money(profit)}</b></div><div><small>GROSS MARGIN</small><b>{margin.toFixed(1)}%</b></div><div><small>RECIPE COST</small><b>{money(recipeCost)}</b></div></div><button className="pos-primary wide" onClick={save}>{editing?'Save changes':'Save menu item'}</button></SimpleModal>}</>
}

function InventoryOwner({data,update}) {
 const [lowOnly,setLowOnly]=useState(false)
 const rows=data.menu.filter(m=>!lowOnly||Number(m.stock)<=5)
 return <><Heading eyebrow="STOCK CONTROL" title="Inventory & stock ledger" sub="Finished-item stock reduces on accepted orders when an opening balance is set. Recipe ingredients are deducted separately in Ingredients. Adjust deliveries and counts here." action={<button className="pos-secondary" onClick={()=>setLowOnly(x=>!x)}>{lowOnly?'Show all items':'Show low stock only'}</button>}/><div className="pos-stats"><Stat label="Tracked menu items" value={data.menu.length} sub="Stock-managed products" icon={Boxes}/><Stat label="Low stock" value={data.menu.filter(m=>Number(m.stock)<=5).length} sub="5 units or fewer" icon={Search} tone="orange"/><Stat label="Out of stock" value={data.menu.filter(m=>Number(m.stock)<=0).length} sub="Ordering blocked" icon={X} tone="red"/></div><section className="pos-card"><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>ITEM</th><th>ON HAND</th><th>STOCK STATUS</th><th>ADJUSTMENT</th></tr></thead><tbody>{rows.length?rows.map(m=><tr key={m.id}><td>{m.emoji} <b>{m.name}</b><small>Unit cost {money(m.cost||0)}</small></td><td><b>{m.stock}</b></td><td><span className={m.stock<=0?'stock-out':m.stock<=5?'stock-low':'stock-ok'}>{m.stock<=0?'Out of stock':m.stock<=5?'Low stock':'In stock'}</span></td><td><button className="round-btn" disabled={m.stock<=0} onClick={()=>update({menu:data.menu.map(x=>x.id===m.id?{...x,stock:Math.max(0,Number(x.stock)-1)}:x)})}>−</button> <button className="round-btn" onClick={()=>update({menu:data.menu.map(x=>x.id===m.id?{...x,stock:Number(x.stock||0)+1}:x)})}>+</button></td></tr>):<tr><td colSpan="4" className="pos-empty">No stock items match this filter.</td></tr>}</tbody></table></div></section></>
}

function IngredientsOwner({data,update,notify}) {
 const [f,setF]=useState({name:'',sku:'',unit:'g',stock:'0',unitCost:'0',lowStock:'0',supplier:''})
 const [restock,setRestock]=useState({})
 const [editing,setEditing]=useState(null)
 const [showForm,setShowForm]=useState(false)
 const rows=data.ingredients||[]
 const reset=()=>{setEditing(null);setF({name:'',sku:'',unit:'g',stock:'0',unitCost:'0',lowStock:'0',supplier:''});setShowForm(false)}
 const save=()=>{
  if(!f.name.trim()||Number(f.stock)<0||Number(f.unitCost)<0||Number(f.lowStock)<0)return notify('Enter valid ingredient details')
  if(editing) update({ingredients:rows.map(x=>x.id===editing?{...x,...f,stock:Number(f.stock),unitCost:Number(f.unitCost),lowStock:Number(f.lowStock)}:x)})
  else update({ingredients:[...rows,{id:'ing'+Date.now(),...f,stock:Number(f.stock),unitCost:Number(f.unitCost),lowStock:Number(f.lowStock)}]})
  reset();notify(editing?'Ingredient updated':'Ingredient added')
 }
 const adjust=(id,delta)=>{const amount=Number(restock[id]||0);if(amount<=0)return notify('Enter a quantity greater than zero');update({ingredients:rows.map(x=>x.id===id?{...x,stock:Math.max(0,Number(x.stock||0)+delta*amount)}:x)});setRestock({...restock,[id]:''});notify(delta>0?'Ingredient stock restocked':'Stock adjusted')}
 const edit=x=>{setEditing(x.id);setF({name:x.name,sku:x.sku||'',unit:x.unit,stock:String(x.stock),unitCost:String(x.unitCost),lowStock:String(x.lowStock||0),supplier:x.supplier||''});setShowForm(true)}
 const remove=x=>{if((data.menu||[]).some(m=>(m.recipe||[]).some(r=>r.ingredientId===x.id)))return notify('This ingredient is used in a menu recipe. Remove it from that recipe first.');if(confirm(`Delete ingredient ${x.name}?`))update({ingredients:rows.filter(i=>i.id!==x.id)})}
 return <><Heading eyebrow="RAW MATERIALS" title="Ingredients inventory" sub="Create, edit and remove ingredients. Recipe quantities deduct automatically when orders are accepted."/><div className="pos-stats"><Stat label="Ingredients" value={rows.length} sub="Raw materials configured" icon={Package}/><Stat label="Low stock" value={rows.filter(x=>Number(x.stock)<=Number(x.lowStock||0)).length} sub="At or below reorder level" icon={Search} tone="orange"/><Stat label="Inventory value" value={money(rows.reduce((s,x)=>s+Number(x.stock||0)*Number(x.unitCost||0),0))} sub="Based on current unit cost" icon={CircleDollarSign} tone="green"/></div>
 <div className="ingredient-toolbar"><button className="pos-primary" onClick={()=>{reset();setShowForm(true)}}><Plus size={16}/> Add ingredient</button></div>
 {showForm&&<SimpleModal title={editing?'Edit ingredient':'Add ingredient'} onClose={reset}><div className="pos-form-grid"><label className="pos-field">Ingredient name<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label className="pos-field">SKU (optional)<input value={f.sku} onChange={e=>setF({...f,sku:e.target.value})}/></label><label className="pos-field">Base unit<select value={f.unit} onChange={e=>setF({...f,unit:e.target.value})}><option value="g">Gram (g)</option><option value="ml">Millilitre (ml)</option><option value="pcs">Pieces (pcs)</option></select></label><label className="pos-field">Stock ({f.unit})<input type="number" min="0" step="0.001" value={f.stock} onChange={e=>setF({...f,stock:e.target.value})}/></label><label className="pos-field">Cost per {f.unit} (₹)<input type="number" min="0" step="0.0001" value={f.unitCost} onChange={e=>setF({...f,unitCost:e.target.value})}/></label><label className="pos-field">Low-stock alert ({f.unit})<input type="number" min="0" step="0.001" value={f.lowStock} onChange={e=>setF({...f,lowStock:e.target.value})}/></label><label className="pos-field">Supplier (optional)<input value={f.supplier} onChange={e=>setF({...f,supplier:e.target.value})}/></label></div><div className="row-actions"><button className="pos-primary" onClick={save}>{editing?'Update ingredient':'Save ingredient'}</button><button className="pos-secondary" onClick={reset}>Cancel</button></div></SimpleModal>}
 <section className="pos-card"><div className="pos-card-head"><div><h3>Ingredient stock</h3><p>Restock or make a manual reduction.</p></div></div><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>INGREDIENT</th><th>ON HAND</th><th>COST / UNIT</th><th>STATUS</th><th>STOCK ADJUSTMENT</th><th>ACTIONS</th></tr></thead><tbody>{rows.length?rows.map(x=><tr key={x.id}><td><b>{x.name}</b><small>{x.sku||x.supplier||'Raw material'} · {x.unit}</small></td><td><b>{Number(x.stock).toLocaleString('en-IN')} {x.unit}</b></td><td>{money(x.unitCost)}/{x.unit}</td><td><span className={Number(x.stock)<=Number(x.lowStock||0)?'stock-low':'stock-ok'}>{Number(x.stock)<=Number(x.lowStock||0)?'Low stock':'In stock'}</span></td><td><div className="ingredient-adjust"><input type="number" min="0.001" step="0.001" placeholder={x.unit} value={restock[x.id]||''} onChange={e=>setRestock({...restock,[x.id]:e.target.value})}/><button className="round-btn" onClick={()=>adjust(x.id,1)}>+</button><button className="round-btn" onClick={()=>adjust(x.id,-1)}>−</button></div></td><td><div className="row-actions"><button className="pos-secondary" onClick={()=>edit(x)}>Edit</button><button className="pos-danger" onClick={()=>remove(x)}>Delete</button></div></td></tr>):<tr><td colSpan="6" className="pos-empty">No ingredients yet. Use Add ingredient to create your first raw material.</td></tr>}</tbody></table></div></section></>
}

function StaffOwner({data,users,setModal,update,updateUsers}) { return <><Heading eyebrow="TEAM & ACCESS" title="Staff management" sub="Create login accounts and assign each person to a department." action={<button className="pos-primary" onClick={()=>setModal({type:'staff'})}><Plus size={16}/> Add staff account</button>}/><div className="staff-role-grid">{roles.slice(1).map(r=><div><r.icon size={20}/><b>{r.label}</b><small>{data.staff.filter(s=>s.department===r.id).length} assigned</small></div>)}</div><section className="pos-card"><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>STAFF MEMBER</th><th>USERNAME</th><th>DEPARTMENT / ACCESS</th><th>SHIFT</th><th>STATUS</th></tr></thead><tbody>{data.staff.length?data.staff.map(s=><tr key={s.id}><td><b>{s.name}</b><small>{s.phone||'No phone added'}</small></td><td>{s.username}</td><td>{s.department}</td><td>{s.shift}</td><td><button className="pos-secondary" onClick={()=>{const active=s.status!=='Active';update({staff:data.staff.map(x=>x.id===s.id?{...x,status:active?'Active':'Inactive'}:x)});updateUsers(users.map(u=>u.id===s.id?{...u,active}:u))}}>{s.status}</button></td></tr>):<tr><td colSpan="5" className="pos-empty">No staff accounts yet. Add a waiter, kitchen, parcel or cashier account.</td></tr>}</tbody></table></div></section></> }
function StaffModal({data,users,update,updateUsers,onClose,notify}) {
  const [f,setF]=useState({name:'',phone:'',username:'',password:'',department:'Waiter',shift:'Full day'})
  const [busy,setBusy]=useState(false)
  const create=async()=>{
    if(!f.name.trim()||!f.username.trim()||f.password.length<6)return notify('Enter name, username and a password of at least 6 characters')
    if(users.some(u=>u.username.toLowerCase()===f.username.trim().toLowerCase()))return notify('This username is already in use')
    setBusy(true)
    const user={id:'u'+Date.now(),name:f.name.trim(),username:f.username.trim(),role:f.department,passwordHash:await hashPassword(f.password),active:true}
    updateUsers([...users,user])
    update({staff:[...data.staff,{id:user.id,name:user.name,username:user.username,phone:f.phone,department:f.department,role:f.department,shift:f.shift,status:'Active'}]})
    setBusy(false);onClose();notify('Staff login account created')
  }
  return <SimpleModal title="Create staff login" onClose={onClose}><p className="modal-help">The staff member will sign in using this username and password. Their department controls which POS screen they can access.</p><div className="pos-form-grid"><label className="pos-field">Full name<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label className="pos-field">Phone (optional)<input value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></label><label className="pos-field">Username<input autoComplete="off" value={f.username} onChange={e=>setF({...f,username:e.target.value})}/></label><label className="pos-field">Temporary password<PasswordInput value={f.password} onChange={e=>setF({...f,password:e.target.value})} autoComplete="new-password"/></label><label className="pos-field">Department<select value={f.department} onChange={e=>setF({...f,department:e.target.value})}>{roles.slice(1).map(r=><option value={r.id}>{r.label}</option>)}</select></label><label className="pos-field">Shift<select value={f.shift} onChange={e=>setF({...f,shift:e.target.value})}><option>Morning</option><option>Evening</option><option>Full day</option></select></label></div><button className="pos-primary wide" disabled={busy} onClick={create}>{busy?'Creating account…':'Create staff account'}</button></SimpleModal>
}
function CustomersOwner({data,orders}) {
 const [q,setQ]=useState('')
 const customers=(data.customers||[]).filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))
 return <><Heading eyebrow="CUSTOMER RELATIONSHIPS" title="Customer directory" sub="Customer details are collected when an order includes a name or mobile number."/><section className="pos-card"><div className="pos-card-head"><div><h3>Saved customers</h3><p>{customers.length} customer profiles</p></div><input className="report-period" placeholder="Search name or mobile" value={q} onChange={e=>setQ(e.target.value)}/></div><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>CUSTOMER</th><th>MOBILE</th><th>ORDERS</th><th>TOTAL SPENDING</th><th>LAST VISIT</th></tr></thead><tbody>{customers.length?customers.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone||'—'}</td><td>{c.visits||orders.filter(o=>o.customerPhone===c.phone).length||0}</td><td><b>{money(c.totalSpent||0)}</b></td><td>{c.lastVisit||'—'}</td></tr>):<tr><td colSpan="5" className="pos-empty">No customer records yet. Add a customer name and mobile number while creating an order.</td></tr>}</tbody></table></div></section></>
}
function ExpensesOwner({data,update,notify}) {
 const [f,setF]=useState({title:'',category:'Other',amount:'',date:today(),note:''})
 const expenses=data.expenses||[]
 const add=()=>{if(!f.title.trim()||Number(f.amount)<=0)return notify('Enter an expense name and a valid amount');update({expenses:[{id:'EX'+Date.now(),...f,amount:Number(f.amount),createdAt:new Date().toISOString()},...expenses]});setF({...f,title:'',amount:'',note:''});notify('Expense recorded')}
 const total=expenses.filter(e=>e.date.slice(0,7)===today().slice(0,7)).reduce((s,e)=>s+Number(e.amount||0),0)
 return <><Heading eyebrow="COST CONTROL" title="Expense management" sub="Record day-to-day operating costs to calculate estimated monthly net profit."/><div className="pos-stats"><Stat label="This month expenses" value={money(total)} sub={`${expenses.filter(e=>e.date.slice(0,7)===today().slice(0,7)).length} entries`} icon={CircleDollarSign} tone="orange"/><Stat label="All recorded expenses" value={money(expenses.reduce((s,e)=>s+Number(e.amount||0),0))} sub="Across all dates" icon={Receipt}/></div><section className="pos-card settings-card"><h3>Add an expense</h3><div className="pos-form-grid"><label className="pos-field">Expense name<input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="e.g. Electricity bill"/></label><label className="pos-field">Category<select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{['Rent','Salary','Electricity','Water','Internet','Packaging','Maintenance','Marketing','Transport','Other'].map(x=><option>{x}</option>)}</select></label><label className="pos-field">Amount (₹)<input type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label className="pos-field">Date<input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><label className="pos-field">Note (optional)<input value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="Payment details"/></label></div><button className="pos-primary" onClick={add}><Plus size={16}/> Save expense</button></section><section className="pos-card"><div className="pos-card-head"><div><h3>Expense history</h3><p>Newest entries first</p></div></div><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>DATE</th><th>EXPENSE</th><th>CATEGORY</th><th>NOTE</th><th>AMOUNT</th><th></th></tr></thead><tbody>{expenses.length?expenses.map(e=><tr key={e.id}><td>{e.date}</td><td><b>{e.title}</b></td><td>{e.category}</td><td>{e.note||'—'}</td><td><b>{money(e.amount)}</b></td><td><button className="pos-danger" onClick={()=>{if(confirm('Delete this expense entry?'))update({expenses:expenses.filter(x=>x.id!==e.id)})}}>Delete</button></td></tr>):<tr><td colSpan="6" className="pos-empty">No expenses recorded yet.</td></tr>}</tbody></table></div></section></>
}

function ReportsOwner({orders,data}) {
 const [period,setPeriod]=useState('Today')
 const todayStr=today()
 const start=period==='Today'?todayStr:period==='7 days'?new Date(Date.now()-6*86400000).toISOString().slice(0,10):period==='30 days'?new Date(Date.now()-29*86400000).toISOString().slice(0,10):'2000-01-01'
 const paid=orders.filter(o=>o.status==='Paid'&&o.date>=start&&o.date<=todayStr)
 const revenue=paid.reduce((sum,o)=>sum+Number(o.subtotal??o.total??0),0)
 const tax=paid.reduce((sum,o)=>sum+Number(o.tax||0),0)
 const cogs=paid.reduce((sum,o)=>sum+o.items.reduce((v,i)=>v+Number(i.cost??0)*Number(i.qty||0),0),0)
 const grossProfit=revenue-cogs
 const expenses=(data.expenses||[]).filter(e=>e.date>=start&&e.date<=todayStr).reduce((sum,e)=>sum+Number(e.amount||0),0)
 const netProfit=grossProfit-expenses
 const margin=revenue>0?grossProfit/revenue*100:0
 const allItems={}
 paid.forEach(o=>o.items.forEach(i=>{const x=allItems[i.id]||(allItems[i.id]={name:i.name,qty:0,revenue:0,cost:0});x.qty+=Number(i.qty);x.revenue+=Number(i.price)*Number(i.qty);x.cost+=Number(i.cost??0)*Number(i.qty)}))
 const best=Object.values(allItems).sort((a,b)=>b.qty-a.qty).slice(0,6)
 const avg=paid.length?paid.reduce((sum,o)=>sum+Number(o.total),0)/paid.length:0
 return <><Heading eyebrow="BUSINESS INTELLIGENCE" title="Sales, cost & profit reports" sub="Payment-confirmed transactions. Gross profit = sales before tax minus recorded item cost." action={<select className="report-period" value={period} onChange={e=>setPeriod(e.target.value)}><option>Today</option><option>7 days</option><option>30 days</option><option>All time</option></select>}/>
 <div className="pos-stats"><Stat label="Net sales (before tax)" value={money(revenue)} sub={`${paid.length} paid orders`} icon={CircleDollarSign}/><Stat label="Cost of goods sold" value={money(cogs)} sub="Based on saved item cost" icon={Boxes} tone="orange"/><Stat label="Gross profit" value={money(grossProfit)} sub={`${margin.toFixed(1)}% gross margin`} icon={BarChart3} tone={grossProfit>=0?'green':'red'}/><Stat label="Net profit" value={money(netProfit)} sub={`After ${money(expenses)} expenses`} icon={CircleDollarSign} tone={netProfit>=0?'green':'red'}/><Stat label="Average bill" value={money(avg)} sub="Including tax" icon={Receipt} tone="purple"/></div>
 <div className="report-grid"><section className="pos-card"><div className="pos-card-head"><div><h3>Revenue reconciliation</h3><p>Sales and tax breakdown</p></div></div><div className="report-metric"><span>Net item sales</span><b>{money(revenue)}</b></div><div className="report-metric"><span>Tax collected (configured rate)</span><b>{money(tax)}</b></div><div className="report-metric"><span>Customer collections</span><b>{money(revenue+tax)}</b></div><div className="report-metric"><span>Less: item cost / COGS</span><b>{money(cogs)}</b></div><div className="report-metric report-profit"><span>Gross profit</span><b>{money(grossProfit)}</b></div><div className="report-metric"><span>Less: operating expenses</span><b>{money(expenses)}</b></div><div className="report-metric report-profit"><span>Estimated net profit</span><b>{money(netProfit)}</b></div><small className="report-note">Estimated net profit subtracts recorded expenses from gross profit. Enter all operating expenses for a more accurate result; unrecorded costs are not included.</small></section>
 <section className="pos-card"><div className="pos-card-head"><div><h3>Sales by channel</h3><p>Paid order collections</p></div></div><div className="channel-row"><span>Counter orders</span><b>{money(paid.filter(o=>o.type==='Counter'||!o.type).reduce((sum,o)=>sum+Number(o.total),0))}</b></div><div className="channel-row"><span>Cash payments</span><b>{money(paid.filter(o=>o.paymentMethod==='Cash').reduce((sum,o)=>sum+o.total,0))}</b></div><div className="channel-row"><span>UPI payments</span><b>{money(paid.filter(o=>o.paymentMethod==='UPI').reduce((sum,o)=>sum+o.total,0))}</b></div><div className="channel-row"><span>Card payments</span><b>{money(paid.filter(o=>o.paymentMethod==='Card').reduce((sum,o)=>sum+o.total,0))}</b></div></section></div>
 <section className="pos-card"><div className="pos-card-head"><div><h3>Best-selling items</h3><p>Quantity, revenue and gross profit by menu item</p></div></div><div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>ITEM</th><th>QTY SOLD</th><th>SALES</th><th>ITEM COST</th><th>GROSS PROFIT</th><th>MARGIN</th></tr></thead><tbody>{best.length?best.map(x=><tr><td><b>{x.name}</b></td><td>{x.qty}</td><td>{money(x.revenue)}</td><td>{money(x.cost)}</td><td className="profit-positive">{money(x.revenue-x.cost)}</td><td>{x.revenue?((x.revenue-x.cost)/x.revenue*100).toFixed(1):'0.0'}%</td></tr>):<tr><td colSpan="6" className="pos-empty">No paid sales in this period yet.</td></tr>}</tbody></table></div></section></>
}

function SettingsOwner({data,update,notify,users,updateUsers,syncToken,setSyncToken,autoSync,setAutoSync,cloudStatus,cloudBusy,cloudRevision,lastSyncAt,onCloudUpload,onCloudDownload}) {
 const r=data.restaurant||{}
 const set=(key,value)=>update({restaurant:{...r,[key]:value}})
 return <><Heading eyebrow="SYSTEM SETTINGS" title="Restaurant & invoice settings" sub="These details appear on printed customer bills. Configure the tax rate only after confirming your applicable tax treatment."/>
 <section className="pos-card settings-card"><h3>Restaurant identity</h3><div className="logo-upload-row"><div className="restaurant-logo-preview">{r.logo?<img src={r.logo} alt="Restaurant logo"/>:<span>LOGO</span>}</div><label className="pos-field">Restaurant logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1024*1024){notify('Logo must be 1 MB or smaller');e.target.value='';return}const reader=new FileReader();reader.onload=()=>set('logo',reader.result);reader.readAsDataURL(file)}}/></label>{r.logo&&<button className="pos-secondary" onClick={()=>set('logo','')}>Remove logo</button>}</div><div className="pos-form-grid"><label className="pos-field">Restaurant name<input value={r.name||''} onChange={e=>set('name',e.target.value)}/></label><label className="pos-field">Phone number<input value={r.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="Restaurant contact"/></label><label className="pos-field">GSTIN (optional)<input value={r.gstin||''} onChange={e=>set('gstin',e.target.value)} placeholder="15-character GSTIN"/></label><label className="pos-field">UPI ID / VPA<input value={r.upiId||''} onChange={e=>set('upiId',e.target.value)} placeholder="restaurant@upi"/></label><label className="pos-field">Invoice prefix<input value={r.invoicePrefix||'INV'} onChange={e=>set('invoicePrefix',e.target.value)}/></label><label className="pos-field">Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={r.taxRate??0} onChange={e=>set('taxRate',Number(e.target.value)||0)}/></label><label className="pos-field">Restaurant address<input value={r.address||''} onChange={e=>set('address',e.target.value)} placeholder="Address printed on invoice"/></label></div><p className="modal-help">Tax is set to 0% by default. Confirm the correct GST rate, service classification and invoice requirements with your accountant before issuing tax invoices. This app does not determine tax eligibility automatically.</p></section>

 <section className="pos-card settings-card"><h3>Customer bill printing</h3><label className="bill-print-setting"><span><b>Automatically print a customer bill after every completed order</b><small>When ON, ServePOS opens the print dialog immediately after an order is saved. When OFF, orders are saved normally without automatically printing a bill.</small></span><input type="checkbox" checked={Boolean(r.autoPrintBill)} onChange={e=>set('autoPrintBill',e.target.checked)}/></label><p className="modal-help">The device must have a configured printer. If the browser or device blocks pop-ups, allow print pop-ups for ServePOS.</p></section>

 <section className="pos-card settings-card"><h3>Cloud sync · Pilot test</h3><p className="modal-help">Connect this test cafe to its own Neon database through your Vercel backend. Local data remains the primary copy. Save a local backup before restoring cloud data.</p><label className="pos-field">Vercel sync token<input type="password" value={syncToken} onChange={e=>setSyncToken(e.target.value)} placeholder="Paste SERVEPOS_SYNC_TOKEN" autoComplete="new-password"/></label><div className="row-actions"><button className="pos-primary" disabled={cloudBusy||!syncToken.trim()} onClick={onCloudUpload}> {cloudBusy?'Please wait…':'Upload local data to cloud'}</button><button className="pos-secondary" disabled={cloudBusy||!syncToken.trim()} onClick={onCloudDownload}>Download / restore cloud data</button></div><label className="bill-print-setting" style={{marginTop:14}}><span><b>Automatic cloud sync</b><small>When enabled, local changes upload after a short pause while internet is available. It does not automatically download or overwrite local data.</small></span><input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} disabled={!syncToken.trim()}/></label><div className="cloud-sync-meta"><b>Sync status:</b> {cloudStatus}<br/><b>Cloud revision:</b> {cloudRevision}<br/><b>Last sync:</b> {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never'}</div><p className="system-warning">Pilot-only security note: the current shared-token API is suitable only for your controlled test device. Do not distribute this build to customers or put the token in a public APK. Production customer sync needs individual server-side authentication.</p></section>

 <section className="pos-card settings-card"><h3>Data & local backup</h3><button className="pos-secondary" onClick={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...data,accounts:users,backupVersion:2,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}));a.download='servepos-backup.json';a.click();URL.revokeObjectURL(a.href)}}>Export backup JSON</button><label className="pos-secondary" style={{display:'inline-flex',marginLeft:8,cursor:'pointer'}}>Restore backup JSON<input type="file" accept="application/json,.json" style={{display:'none'}} onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const backup=JSON.parse(reader.result);if(!backup.restaurant||!Array.isArray(backup.menu)||!Array.isArray(backup.orders))throw new Error('Invalid backup');if(!confirm('Restore this backup? Current restaurant data will be replaced.'))return;const {accounts,...rest}=backup;update({...clone(seedData),...rest,customers:rest.customers||[],expenses:rest.expenses||[],ingredients:rest.ingredients||[]});if(Array.isArray(accounts)&&accounts.length)updateUsers(accounts);notify('Backup restored successfully')}catch{notify('Could not restore: invalid backup file')}finally{e.target.value=''}};reader.readAsText(file)}}/></label><p className="system-warning">ServePOS stores this cafe data in this browser on this device. Export backups regularly. Cloud database and multi-device sync are not active in this test build.</p><button className="pos-secondary" onClick={()=>{if(confirm('Clear all menu items, tables, orders and staff accounts? Your owner login and restaurant name will remain.')){update({...clone(seedData),restaurant:{...seedData.restaurant,name:r.name}});updateUsers(users.filter(u=>u.role==='Owner'));notify('Restaurant records cleared')}}}>Clear restaurant records</button></section></>
}
function SimpleModal({title,children,onClose}) { return <div className="pos-overlay"><div className="simple-modal"><div className="pos-modal-head"><h2>{title}</h2><button onClick={onClose}><X/></button></div><div className="simple-modal-content">{children}</div></div></div> }
function mergeItems(oldItems,newItems) { const out=oldItems.map(i=>({...i}));newItems.forEach(n=>{const f=out.find(i=>i.id===n.id);if(f){const q=f.qty+n.qty;f.cost=q>0?((Number(f.cost||0)*f.qty+Number(n.cost||0)*n.qty)/q):Number(f.cost||0);f.qty=q;f.lineCost=f.cost*q}else out.push({...n})});return out }

// Owner department shortcuts use the same app-level role switch.

