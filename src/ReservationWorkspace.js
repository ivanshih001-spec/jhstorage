import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import './ReservationWorkspace.css';

const ROLE_LABELS = {
  admin: '管理員',
  warehouse: '倉管',
  sales: '業務',
  unassigned: '未設定',
};

const STATUS_LABELS = {
  pending: '待調撥',
  confirmed: '已調撥',
  returned: '已退回',
  cancelled: '已取消',
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const availableQuantity = (item) => Math.max(0, Number(item.quantity || 0) - Number(item.reservedQuantity || 0));
const getPhoto = (item) => item?.photos?.find(Boolean) || item?.photo || '';
const formatDateTime = (value) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';

function createRequestNumber() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const randomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RT-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${randomCode}`;
}

function StatusBadge({ status }) {
  return <span className={`reservation-status is-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

function ProductPhoto({ item }) {
  const photo = getPhoto(item);
  return photo
    ? <img className="reservation-product-photo" src={photo} alt={`${item.partNumber || '產品'} 外觀`} />
    : <div className="reservation-product-photo is-empty">無照片</div>;
}

export default function ReservationWorkspace({
  db,
  appId,
  inventory,
  currentUser,
  currentRole,
  userRoles,
  accountDirectory,
  onSave,
  addAuditLog,
  createManagedAccount,
  updateManagedRole,
  removeManagedAccountFromDirectory,
}) {
  const canApprove = currentRole === 'warehouse' || currentRole === 'admin';
  const canManageRoles = currentRole === 'admin';
  const [activeView, setActiveView] = useState(currentRole === 'sales' ? 'create' : 'requests');
  const [reservations, setReservations] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [expectedShipDate, setExpectedShipDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [roleForm, setRoleForm] = useState({ account: '', displayName: '', role: 'sales', password: '' });
  const [pendingRoles, setPendingRoles] = useState({});

  useEffect(() => {
    const reservationRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory_reservations');
    return onSnapshot(reservationRef, (snapshot) => {
      const next = snapshot.docs
        .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setReservations(next);
      setSelectedRequest((current) => current ? next.find((item) => item.id === current.id) || null : null);
    }, (error) => {
      console.error(error);
      onSave('error', '無法讀取庫存暫提資料');
    });
  }, [appId, db, onSave]);

  useEffect(() => {
    if (currentRole === 'sales' && ['requests', 'roles'].includes(activeView)) setActiveView('create');
    if (!canManageRoles && activeView === 'roles') setActiveView(canApprove ? 'requests' : 'create');
  }, [activeView, canApprove, canManageRoles, currentRole]);

  const filteredProducts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return [];
    return inventory
      .filter((item) => [item.partNumber, item.name, item.category, item.material, item.size, item.color]
        .some((value) => String(value || '').toLowerCase().includes(keyword)))
      .sort((a, b) => availableQuantity(b) - availableQuantity(a))
      .slice(0, 40);
  }, [inventory, searchText]);

  const visibleReservations = useMemo(() => {
    if (activeView === 'mine' || currentRole === 'sales') {
      return reservations.filter((request) => request.requestedByUid === currentUser.uid || normalizeEmail(request.requestedByEmail) === normalizeEmail(currentUser.email));
    }
    return reservations;
  }, [activeView, currentRole, currentUser.email, currentUser.uid, reservations]);

  const cartTotal = cart.reduce((sum, line) => sum + Number(line.requestedQuantity || 0), 0);

  const managedAccounts = useMemo(() => (accountDirectory || [])
    .filter((account) => account.authActive !== false)
    .map((account) => {
      const profile = userRoles.find((role) => normalizeEmail(role.email) === normalizeEmail(account.email));
      return {
        ...account,
        displayName: profile?.displayName || account.displayName || account.email,
        role: profile?.active === false ? 'unassigned' : profile?.role || 'unassigned',
      };
    })
    .sort((a, b) => {
      if (a.role === 'unassigned' && b.role !== 'unassigned') return -1;
      if (a.role !== 'unassigned' && b.role === 'unassigned') return 1;
      return String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), 'zh-Hant');
    }), [accountDirectory, userRoles]);

  const addToCart = (item) => {
    const available = availableQuantity(item);
    if (available <= 0) {
      onSave('error', '此品項目前沒有可暫提庫存');
      return;
    }
    setCart((current) => {
      if (current.some((line) => line.itemId === item.id)) return current;
      return [...current, {
        itemId: item.id,
        partNumber: item.partNumber || '',
        name: item.name || '',
        category: item.category || '',
        material: item.material || '',
        spec: item.spec || '',
        size: item.size || '',
        color: item.color || '',
        remarks: item.remarks || '',
        photo: getPhoto(item),
        requestedQuantity: 1,
      }];
    });
  };

  const updateCartQuantity = (itemId, value) => {
    const item = inventory.find((candidate) => candidate.id === itemId);
    const max = item ? availableQuantity(item) : 0;
    const next = Math.max(1, Math.min(Number(value || 1), max || 1));
    setCart((current) => current.map((line) => line.itemId === itemId ? { ...line, requestedQuantity: next } : line));
  };

  const submitReservation = async () => {
    if (!customerName.trim()) {
      onSave('error', '請填寫客戶或訂單名稱');
      return;
    }
    if (cart.length === 0) {
      onSave('error', '請先加入至少一項產品');
      return;
    }

    setIsSubmitting(true);
    const requestRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory_reservations'));
    const requestNumber = createRequestNumber();
    const now = new Date().toISOString();
    try {
      await runTransaction(db, async (transaction) => {
        const snapshots = [];
        for (const line of cart) {
          const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', line.itemId);
          const itemSnapshot = await transaction.get(itemRef);
          if (!itemSnapshot.exists()) throw new Error(`${line.partNumber} 已不存在`);
          snapshots.push({ line, itemRef, item: itemSnapshot.data() });
        }

        for (const { line, itemRef, item } of snapshots) {
          const available = availableQuantity(item);
          if (available < line.requestedQuantity) {
            throw new Error(`${line.partNumber} 可用庫存只剩 ${available}`);
          }
          transaction.update(itemRef, {
            reservedQuantity: Number(item.reservedQuantity || 0) + Number(line.requestedQuantity),
            lastUpdated: now,
            lastEditor: currentUser.email,
          });
        }

        transaction.set(requestRef, {
          requestNumber,
          status: 'pending',
          customerName: customerName.trim(),
          expectedShipDate: expectedShipDate || '',
          notes: notes.trim(),
          // 照片可能是 Base64，暫提單只存產品文字快照，避免超過 Firestore 1 MiB 文件上限。
          lines: cart.map(({ photo, ...line }) => ({ ...line, requestedQuantity: Number(line.requestedQuantity) })),
          requestedByUid: currentUser.uid,
          requestedByEmail: currentUser.email,
          requestedByName: userRoles.find((profile) => normalizeEmail(profile.email) === normalizeEmail(currentUser.email))?.displayName || currentUser.email?.split('@')[0] || '業務',
          createdAt: now,
          updatedAt: now,
          handledByEmail: '',
          handledAt: '',
        });
      });

      await addAuditLog('庫存暫提', requestNumber, `${customerName.trim()}；${cart.length} 項，共 ${cartTotal} PCS`, currentUser.email);
      setCart([]);
      setCustomerName('');
      setExpectedShipDate('');
      setNotes('');
      setSearchText('');
      setActiveView('mine');
      onSave('success', `暫提單 ${requestNumber} 已送出，庫存已保留`);
    } catch (error) {
      console.error(error);
      onSave('error', error.message || '建立暫提單失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequest = async (request, nextStatus) => {
    const actionLabels = { confirmed: '確認調撥', returned: '退回', cancelled: '取消' };
    if (!window.confirm(`確定要${actionLabels[nextStatus]}暫提單 ${request.requestNumber} 嗎？`)) return;

    setIsSubmitting(true);
    const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory_reservations', request.id);
    const now = new Date().toISOString();
    try {
      await runTransaction(db, async (transaction) => {
        const latestRequestSnapshot = await transaction.get(requestRef);
        if (!latestRequestSnapshot.exists()) throw new Error('暫提單不存在');
        const latestRequest = latestRequestSnapshot.data();
        if (latestRequest.status !== 'pending') throw new Error('此暫提單已被其他人處理');

        const snapshots = [];
        for (const line of latestRequest.lines || []) {
          const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', line.itemId);
          const itemSnapshot = await transaction.get(itemRef);
          if (!itemSnapshot.exists()) {
            if (nextStatus === 'confirmed') throw new Error(`${line.partNumber} 已不存在，無法確認調撥`);
            snapshots.push({ line, itemRef, item: null });
            continue;
          }
          snapshots.push({ line, itemRef, item: itemSnapshot.data() });
        }

        for (const { line, itemRef, item } of snapshots) {
          if (!item) continue;
          const requested = Number(line.requestedQuantity || 0);
          const reserved = Number(item.reservedQuantity || 0);
          if (nextStatus === 'confirmed' && reserved < requested) throw new Error(`${line.partNumber} 暫提數量不一致，無法確認調撥`);
          const update = {
            reservedQuantity: Math.max(0, reserved - requested),
            lastUpdated: now,
            lastEditor: currentUser.email,
          };
          if (nextStatus === 'confirmed') {
            const quantity = Number(item.quantity || 0);
            if (quantity < requested) throw new Error(`${line.partNumber} 實際庫存不足`);
            update.quantity = quantity - requested;
          }
          transaction.update(itemRef, update);
        }

        transaction.update(requestRef, {
          status: nextStatus,
          updatedAt: now,
          handledAt: now,
          handledByEmail: currentUser.email,
        });
      });

      const auditAction = nextStatus === 'confirmed' ? '暫提調撥' : nextStatus === 'returned' ? '暫提退回' : '暫提取消';
      await addAuditLog(auditAction, request.requestNumber, `${request.customerName}；${request.lines?.length || 0} 項`, currentUser.email);
      onSave('success', `${request.requestNumber} 已${actionLabels[nextStatus]}`);
    } catch (error) {
      console.error(error);
      const message = error.code === 'permission-denied'
        ? '權限不足：請重新登入，並確認此帳號仍為有效倉管角色'
        : error.message || '處理暫提單失敗';
      onSave('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveRole = async (event) => {
    event.preventDefault();
    if (!roleForm.account.trim()) return;
    try {
      const email = await createManagedAccount(roleForm);
      setRoleForm({ account: '', displayName: '', role: 'sales', password: '' });
      onSave('success', `已建立 ${email}（${ROLE_LABELS[roleForm.role]}）`);
    } catch (error) {
      console.error(error);
      const message = error.code === 'auth/email-already-in-use'
        ? '此帳號已存在；如需變更密碼，請由 Firebase Authentication 重設'
        : error.message || '帳號建立失敗';
      onSave('error', message);
    }
  };

  const saveExistingRole = async (account) => {
    const role = pendingRoles[account.email] || account.role;
    try {
      await updateManagedRole({ email: account.email, role, displayName: account.displayName, uid: account.uid });
      setPendingRoles((current) => {
        const next = { ...current };
        delete next[account.email];
        return next;
      });
      onSave('success', `${account.displayName || account.email} 已設定為${ROLE_LABELS[role]}`);
    } catch (error) {
      console.error(error);
      onSave('error', error.message || '角色變更失敗');
    }
  };

  const removeExistingAccount = async (account) => {
    const confirmed = window.confirm(`請先確認已在 Firebase Authentication 刪除 ${account.email}。\n\n此操作只會從角色管理清單移除並停用角色，保留稽核紀錄。是否繼續？`);
    if (!confirmed) return;
    try {
      await removeManagedAccountFromDirectory(account);
      onSave('success', `${account.displayName || account.email} 已從帳號目錄移除`);
    } catch (error) {
      console.error(error);
      onSave('error', error.message || '帳號目錄移除失敗');
    }
  };

  const renderCreate = () => (
    <div className="reservation-create-layout">
      <section className="reservation-panel">
        <div className="reservation-panel-head">
          <div><span>01</span><div><h2>選擇產品</h2><p>系統會自動扣除其他暫提單已保留的數量</p></div></div>
        </div>
        <label className="reservation-search">
          <Search size={18} />
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜尋料號、品名、規格或顏色" />
          {searchText && <button type="button" onClick={() => setSearchText('')}><X size={16} /></button>}
        </label>

        {!searchText && <div className="reservation-empty"><Search size={34} /><strong>輸入料號或品名開始搜尋</strong><span>可同時暫提多項產品</span></div>}
        {searchText && filteredProducts.length === 0 && <div className="reservation-empty"><AlertTriangle size={34} /><strong>找不到符合的產品</strong></div>}
        <div className="reservation-product-list">
          {filteredProducts.map((item) => {
            const available = availableQuantity(item);
            const alreadyAdded = cart.some((line) => line.itemId === item.id);
            return (
              <article key={item.id} className="reservation-product-card">
                <ProductPhoto item={item} />
                <div className="reservation-product-info">
                  <strong>{item.partNumber || '未設定料號'}</strong>
                  <span>{item.name || '未設定品名'}・{item.material || '未設定材質'}・{item.size || item.spec || '未設定規格'}</span>
                  <small>{item.category || '未分類'}{item.color ? `・${item.color}` : ''}</small>
                </div>
                <div className="reservation-stock-metrics">
                  <span>實際 <strong>{Number(item.quantity || 0).toLocaleString()}</strong></span>
                  <span>已暫提 <strong>{Number(item.reservedQuantity || 0).toLocaleString()}</strong></span>
                  <span className={available <= 0 ? 'is-zero' : ''}>可用 <strong>{available.toLocaleString()}</strong></span>
                </div>
                <button type="button" disabled={available <= 0 || alreadyAdded} onClick={() => addToCart(item)}>
                  {alreadyAdded ? <Check size={17} /> : <Plus size={17} />}{alreadyAdded ? '已加入' : '加入'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="reservation-cart">
        <div className="reservation-cart-head"><ShoppingCart size={20} /><div><strong>暫提清單</strong><span>{cart.length} 項・{cartTotal.toLocaleString()} PCS</span></div></div>
        <div className="reservation-cart-lines">
          {cart.length === 0 && <div className="reservation-cart-empty">尚未加入產品</div>}
          {cart.map((line) => {
            const item = inventory.find((candidate) => candidate.id === line.itemId);
            return (
              <div key={line.itemId} className="reservation-cart-line">
                <div><strong>{line.partNumber}</strong><span>{line.name}</span></div>
                <div className="reservation-cart-qty"><input type="number" min="1" max={item ? availableQuantity(item) : 1} value={line.requestedQuantity} onChange={(event) => updateCartQuantity(line.itemId, event.target.value)} /><span>PCS</span></div>
                <button type="button" aria-label="移除" onClick={() => setCart((current) => current.filter((candidate) => candidate.itemId !== line.itemId))}><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
        <div className="reservation-form-fields">
          <label>客戶／訂單名稱<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="例如：王先生 11月訂單" /></label>
          <label>預計出貨日<input type="date" value={expectedShipDate} onChange={(event) => setExpectedShipDate(event.target.value)} /></label>
          <label>備註<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="顏色、包裝或其他調撥說明" /></label>
        </div>
        <button type="button" className="reservation-primary-action" disabled={isSubmitting || cart.length === 0} onClick={submitReservation}><ClipboardCheck size={18} />{isSubmitting ? '處理中…' : '確認暫提並送出'}</button>
      </aside>
    </div>
  );

  const renderRequests = () => (
    <section className="reservation-panel">
      <div className="reservation-summary-grid">
        <div><Clock3 /><span>待調撥<strong>{visibleReservations.filter((item) => item.status === 'pending').length}</strong></span></div>
        <div><PackageCheck /><span>已調撥<strong>{visibleReservations.filter((item) => item.status === 'confirmed').length}</strong></span></div>
        <div><RotateCcw /><span>退回／取消<strong>{visibleReservations.filter((item) => ['returned', 'cancelled'].includes(item.status)).length}</strong></span></div>
      </div>
      <div className="reservation-request-list">
        {visibleReservations.length === 0 && <div className="reservation-empty"><ClipboardCheck size={34} /><strong>目前沒有暫提單</strong></div>}
        {visibleReservations.map((request) => (
          <button type="button" key={request.id} className="reservation-request-card" onClick={() => setSelectedRequest(request)}>
            <div className="reservation-request-main">
              <div><strong>{request.requestNumber}</strong><StatusBadge status={request.status} /></div>
              <h3>{request.customerName || '未填寫客戶'}</h3>
              <p>{request.requestedByName || request.requestedByEmail}・{formatDateTime(request.createdAt)}</p>
            </div>
            <div className="reservation-request-meta">
              <span><ShoppingCart size={15} />{request.lines?.length || 0} 項</span>
              <span><CalendarDays size={15} />{request.expectedShipDate || '未設定出貨日'}</span>
              <ChevronRight size={19} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );

  const renderRoles = () => (
    <div className="reservation-role-layout">
      <section className="reservation-panel">
        <div className="reservation-panel-title"><UserCog size={21} /><div><h2>新增員工帳號</h2><p>建立業務或倉管登入帳號；密碼至少 6 碼</p></div></div>
        <form className="reservation-role-form" onSubmit={saveRole}>
          <label>登入帳號<input type="text" required value={roleForm.account} onChange={(event) => setRoleForm((current) => ({ ...current, account: event.target.value }))} placeholder="例如：EDITH" autoCapitalize="none" /></label>
          <label>顯示名稱<input value={roleForm.displayName} onChange={(event) => setRoleForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="例如：EDITH" /></label>
          <label>初始密碼<input type="password" required minLength="6" value={roleForm.password} onChange={(event) => setRoleForm((current) => ({ ...current, password: event.target.value }))} placeholder="至少 6 碼" autoComplete="new-password" /></label>
          <label>角色<select value={roleForm.role} onChange={(event) => setRoleForm((current) => ({ ...current, role: event.target.value }))}><option value="sales">業務</option><option value="warehouse">倉管</option></select></label>
          <button type="submit"><ShieldCheck size={18} />建立帳號</button>
        </form>
      </section>
      <section className="reservation-panel">
        <div className="reservation-panel-title"><ShieldCheck size={21} /><div><h2>系統帳號目錄</h2><p>共 {managedAccounts.length} 個帳號；未設定優先顯示，Firebase Console 刪除後需重新同步</p></div></div>
        <div className="reservation-role-list">
          {managedAccounts.length === 0 && <div className="reservation-role-empty">帳號目錄尚未同步</div>}
          {managedAccounts.map((account) => {
            const selectedRole = pendingRoles[account.email] || account.role;
            const isSelf = normalizeEmail(account.email) === normalizeEmail(currentUser.email);
            return (
            <div key={account.id || account.email}>
              <div><strong>{account.displayName || account.email}</strong><span>{account.email}・{(account.providers || []).includes('google.com') ? 'Google' : (account.providers || []).includes('password') ? '密碼登入' : '登入方式待同步'}</span></div>
              <select value={selectedRole} disabled={isSelf} onChange={(event) => setPendingRoles((current) => ({ ...current, [account.email]: event.target.value }))} aria-label={`${account.displayName || account.email} 角色`}>
                <option value="unassigned">未設定</option>
                <option value="sales">業務</option>
                <option value="warehouse">倉管</option>
                <option value="admin">管理員</option>
              </select>
              <div className="reservation-role-actions">
                <button type="button" disabled={isSelf || selectedRole === account.role} onClick={() => saveExistingRole(account)}>{isSelf ? '目前帳號' : '儲存'}</button>
                {!isSelf && <button type="button" className="is-remove" onClick={() => removeExistingAccount(account)}>從清單移除</button>}
              </div>
            </div>
          );})}
        </div>
      </section>
    </div>
  );

  return (
    <div className="reservation-workspace">
      <div className="reservation-hero">
        <div><span>INVENTORY RESERVATION</span><h1>庫存暫提</h1><p>先保留、後調撥，避免不同業務重複占用同一批庫存。</p></div>
        <div className="reservation-role-chip"><ShieldCheck size={17} />{ROLE_LABELS[currentRole] || '未設定角色'}</div>
      </div>

      <div className="reservation-tabs">
        <button type="button" className={activeView === 'create' ? 'is-active' : ''} onClick={() => setActiveView('create')}><Plus size={17} />建立暫提</button>
        <button type="button" className={activeView === 'mine' ? 'is-active' : ''} onClick={() => setActiveView('mine')}><ShoppingCart size={17} />我的暫提</button>
        {canApprove && <button type="button" className={activeView === 'requests' ? 'is-active' : ''} onClick={() => setActiveView('requests')}><ClipboardCheck size={17} />調撥審核</button>}
        {canManageRoles && <button type="button" className={activeView === 'roles' ? 'is-active' : ''} onClick={() => setActiveView('roles')}><UserCog size={17} />角色管理</button>}
      </div>

      {activeView === 'create' && renderCreate()}
      {['mine', 'requests'].includes(activeView) && renderRequests()}
      {activeView === 'roles' && renderRoles()}

      {selectedRequest && (
        <div className="reservation-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedRequest(null)}>
          <aside className="reservation-drawer">
            <div className="reservation-drawer-head"><div><span>暫提單明細</span><strong>{selectedRequest.requestNumber}</strong></div><button type="button" onClick={() => setSelectedRequest(null)}><X size={20} /></button></div>
            <div className="reservation-drawer-overview"><StatusBadge status={selectedRequest.status} /><h2>{selectedRequest.customerName}</h2><p>申請人：{selectedRequest.requestedByName || selectedRequest.requestedByEmail}</p><p>申請時間：{formatDateTime(selectedRequest.createdAt)}</p><p>預計出貨：{selectedRequest.expectedShipDate || '未設定'}</p>{selectedRequest.notes && <p>備註：{selectedRequest.notes}</p>}</div>
            <div className="reservation-drawer-lines">
              {(selectedRequest.lines || []).map((line) => {
                const currentItem = inventory.find((item) => item.id === line.itemId);
                const product = currentItem || line;
                return (
                  <div key={line.itemId}>
                    <ProductPhoto item={product} />
                    <div>
                      <strong>{line.partNumber}</strong>
                      <span>{line.name}・尺寸 {line.size || '—'}・材質 {line.material || '—'}{line.spec ? ` ${line.spec}` : ''}・顏色 {line.color || '—'}</span>
                      <small>庫存備註：{currentItem?.remarks || line.remarks || '無'}</small>
                    </div>
                    <b>{Number(line.requestedQuantity || 0).toLocaleString()} PCS</b>
                  </div>
                );
              })}
            </div>
            {selectedRequest.status === 'pending' && (
              <div className="reservation-drawer-actions">
                {(selectedRequest.requestedByUid === currentUser.uid || currentRole === 'admin') && <button type="button" className="is-cancel" disabled={isSubmitting} onClick={() => handleRequest(selectedRequest, 'cancelled')}>取消暫提</button>}
                {canApprove && <button type="button" className="is-return" disabled={isSubmitting} onClick={() => handleRequest(selectedRequest, 'returned')}>退回業務</button>}
                {canApprove && <button type="button" className="is-confirm" disabled={isSubmitting} onClick={() => handleRequest(selectedRequest, 'confirmed')}><PackageCheck size={18} />確認調撥並扣庫存</button>}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

