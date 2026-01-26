import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  increment, 
  onSnapshot,
  deleteDoc,
  writeBatch,
  addDoc,   
  query,    
  orderBy,  
  limit     
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signInWithPopup,      
  GoogleAuthProvider,   
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Package, 
  Search, 
  PlusCircle, 
  MinusCircle,
  Database,
  AlertCircle, 
  CheckCircle, 
  Loader,      
  Trash,       
  Edit,        
  X,
  AlertTriangle,
  Folder,
  ArrowLeft,
  Palette,
  FolderOpen,
  Camera,
  Image as ImageIcon,
  Download,
  Lock,
  Unlock,
  FileSpreadsheet,
  Upload,
  CheckSquare,
  ShieldAlert,
  Save,
  Pencil,
  LogOut, 
  User,
  History 
} from 'lucide-react';

// ==========================================
// 【發布設定區】
// 請將下方的設定替換為您自己的 Firebase Config
// ==========================================
const manualConfig = {
  apiKey: "AIzaSyBH0CggQcMwwX-Dv9HFT5Vr5LWYrUq1ga8",
  authDomain: "gemini-storage-f3e00.firebaseapp.com",
  projectId: "gemini-storage-f3e00",
  storageBucket: "gemini-storage-f3e00.firebasestorage.app",
  messagingSenderId: "57229786361",
  appId: "1:57229786361:web:fe1cc3b5ab532cad3f3628",
  measurementId: "G-H42133M94Y"
};

// --- Firebase 初始化邏輯 ---
let firebaseConfig;
let isDemoEnv = false;

if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
  isDemoEnv = true;
} else {
  firebaseConfig = manualConfig;
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = typeof __app_id !== 'undefined' ? __app_id : 'inventory-master-system-v3';

// --- 安全性設定：密碼編碼 ---
const ADMIN_PWD_HASH = "ODM1NQ=="; // 8355
const SUPER_ADMIN_PWD_HASH = "MDYwNQ=="; // 0605

// --- 工具函式：簡化 Email 顯示 ---
const formatUserName = (email) => {
  if (!email) return 'Guest';
  return email.split('@')[0];
};

// --- 工具函式：數值格式化 (避免 undefined/null) ---
const formatVal = (v) => (v === undefined || v === null) ? '' : String(v);

// --- 工具函式：比對物件差異 (產生 Before -> After 紀錄) ---
const getDiff = (oldItem, newItem) => {
  const changes = [];
  const fieldMap = {
    partNumber: '料號',
    name: '品名',
    size: '尺寸',
    category: '分類',
    material: '材質',
    spec: '材質規格',
    color: '顏色',
    remarks: '備註',
    quantity: '庫存',
    safetyStock: '安全庫存'
  };

  Object.keys(fieldMap).forEach(key => {
    const v1 = formatVal(oldItem[key]);
    const v2 = formatVal(newItem[key]);
    // 使用寬鬆比對 (處理數字與字串 5000 == "5000")
    if (v1 != v2) {
       changes.push(`${fieldMap[key]}: ${v1 || '(空)'} -> ${v2 || '(空)'}`);
    }
  });

  if (oldItem.photo !== newItem.photo) {
     changes.push('照片: 已變更');
  }

  return changes.join('; ');
};

// --- 工具函式：寫入操作紀錄 ---
const addAuditLog = async (action, productName, details, userEmail) => {
  if (!userEmail) return;
  try {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), {
      timestamp: new Date().toISOString(),
      user: userEmail,
      action: action,
      product: productName || '多筆/未知',
      details: details,
    });
  } catch (err) {
    console.error("Log Error:", err);
  }
};

// --- 工具函式：解析尺寸數值 ---
const getSizeValue = (sizeStr) => {
  if (!sizeStr) return { type: 3, val: 0 }; 
  const s = sizeStr.toString().toLowerCase().trim();

  if (s.endsWith('mm')) {
    const num = parseFloat(s.replace('mm', ''));
    return { type: 0, val: isNaN(num) ? 0 : num };
  }

  let clean = s.replace(/["inch英吋]/g, '').trim();
  let val = 0;
  let isNumeric = false;

  if (clean.includes('-') && clean.includes('/')) {
     const parts = clean.split('-');
     if (parts.length === 2) {
       const intVal = parseFloat(parts[0]);
       const fracParts = parts[1].split('/');
       if (!isNaN(intVal) && fracParts.length === 2) {
         const numerator = parseFloat(fracParts[0]);
         const denominator = parseFloat(fracParts[1]);
         if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
            val = intVal + (numerator / denominator);
            isNumeric = true;
         }
       }
     }
  } else if (clean.includes('/')) {
    const fracParts = clean.split('/');
    if (fracParts.length === 2) {
      const numerator = parseFloat(fracParts[0]);
      const denominator = parseFloat(fracParts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        val = numerator / denominator;
        isNumeric = true;
      }
    }
  } else {
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      val = num;
      isNumeric = true;
    }
  }

  if (isNumeric) {
    return { type: 1, val: val };
  }
  return { type: 2, val: s };
};

// --- 工具函式：全域排序邏輯 ---
const sortInventoryItems = (a, b) => {
  const nameA = a.name || '';
  const nameB = b.name || '';
  const nameCompare = nameA.localeCompare(nameB, "zh-Hant");
  if (nameCompare !== 0) return nameCompare;
  
  const sizeA = getSizeValue(a.size);
  const sizeB = getSizeValue(b.size);

  if (sizeA.type !== sizeB.type) {
    return sizeA.type - sizeB.type; 
  }
  if (sizeA.type === 0 || sizeA.type === 1) {
    return sizeA.val - sizeB.val; 
  }
  if (sizeA.type === 2) {
    return sizeA.val.localeCompare(sizeB.val);
  }

  const matA = a.material || '';
  const matB = b.material || '';
  const matCompare = matA.localeCompare(matB, "zh-Hant");
  if (matCompare !== 0) return matCompare;

  const partA = a.partNumber || '';
  const partB = b.partNumber || '';
  return partA.localeCompare(partB);
};

// --- 工具函式：匯出 CSV ---
const exportToCSV = (data, fileName = 'inventory_export') => {
  const headers = ["序號", "料號", "品名", "尺寸", "分類", "材質", "材質規格", "顏色", "備註", "庫存數量", "安全庫存", "最後操作者", "最後更新時間"];
  
  const csvRows = data.map((item, index) => {
    const safe = (text) => `"${(text || '').toString().replace(/"/g, '""')}"`;
    return [
      index + 1,
      safe(item.partNumber),
      safe(item.name),
      safe(item.size),
      safe(item.category),
      safe(item.material),
      safe(item.spec),
      safe(item.color),
      safe(item.remarks), 
      item.quantity,
      item.safetyStock || 5000,
      safe(item.lastEditor ? formatUserName(item.lastEditor) : '-'), 
      safe(new Date(item.lastUpdated).toLocaleString())
    ].join(",");
  });

  const csvString = "\uFEFF" + headers.join(",") + "\n" + csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- 工具函式：產生匯入範本 ---
const downloadImportTemplate = () => {
  const headers = ["料號", "品名", "尺寸", "分類(成品/零件)", "材質", "材質規格", "顏色(黑色/有色請填色號)", "備註(可空白)", "庫存數量", "安全庫存(預設5000)", "照片(填入網址)"];
  const exampleRow = ["A-001", "範例螺絲A", "5/8\"", "零件", "不鏽鋼", "M5x10", "黑色", "無備註", "100", "5000", ""];
  const csvString = "\uFEFF" + headers.join(",") + "\n" + exampleRow.join(",");
  
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "庫存匯入範本.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- 提示視窗組件 ---
function NotificationModal({ type, text, onClose }) {
  if (!text) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs sm:max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className={`p-6 flex flex-col items-center justify-center ${type === 'error' ? 'bg-red-50' : 'bg-green-50'}`}>
          {type === 'error' ? <AlertCircle size={40} className="text-red-600"/> : <CheckCircle size={40} className="text-green-600"/>}
          <h3 className={`text-xl font-bold ${type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
            {type === 'error' ? '操作失敗' : '操作成功'}
          </h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6 font-medium text-base break-words">{text}</p>
          <button onClick={onClose} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg ${type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>確定</button>
        </div>
      </div>
    </div>
  );
}

// --- 確認視窗 ---
function ConfirmModal({ title, content, onConfirm, onCancel, confirmText = "確認", confirmColor = "bg-red-600" }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6 flex flex-col items-center justify-center bg-slate-50">
           <div className="bg-slate-200 p-3 rounded-full mb-3"><AlertTriangle size={40} className="text-slate-600"/></div>
           <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6 font-medium text-base break-words">{content}</p>
          <div className="flex gap-3">
             <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
             <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl font-bold text-white ${confirmColor}`}>{confirmText}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 操作紀錄視窗 ---
function AuditLogModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-in zoom-in-95">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50 rounded-t-2xl">
           <h3 className="font-bold text-indigo-900 flex items-center gap-2"><History size={20}/> 系統操作紀錄</h3>
           <button onClick={onClose} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-600"><X size={20}/></button>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-slate-50">
          {loading ? <div className="flex justify-center p-10"><Loader className="animate-spin text-indigo-400"/></div> : (
            <table className="w-full text-left text-xs bg-white rounded-lg shadow-sm border border-slate-200">
              <thead className="bg-slate-100 text-slate-500 font-semibold sticky top-0">
                <tr>
                   <th className="p-3">時間</th>
                   <th className="p-3">帳號</th>
                   <th className="p-3">動作</th>
                   <th className="p-3">產品</th>
                   <th className="p-3">內容詳情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-mono text-blue-600">{formatUserName(log.user)}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 font-bold">{log.action}</span></td>
                    <td className="p-3 font-bold text-slate-700">{log.product}</td>
                    <td className="p-3 text-slate-500 break-all max-w-[200px]">{log.details}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">尚無紀錄</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// --- 密碼輸入視窗 ---
function PasswordModal({ onClose, onSuccess }) {
  const [pwd, setPwd] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    const hash = btoa(pwd);
    if (hash === ADMIN_PWD_HASH) {
      onSuccess(false);
      onClose();
    } else if (hash === SUPER_ADMIN_PWD_HASH) {
      onSuccess(true);
      onClose();
    } else {
      alert('密碼錯誤');
      setPwd('');
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-xl w-72 animate-in zoom-in-95">
        <h3 className="font-bold text-lg mb-4 text-center text-slate-800">請輸入管理員密碼</h3>
        <input type="password" autoFocus className="w-full border-2 border-slate-200 p-3 rounded-xl mb-4 text-center text-lg tracking-widest" placeholder="●●●●" value={pwd} onChange={e=>setPwd(e.target.value)} />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold">取消</button>
          <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">確認</button>
        </div>
      </form>
    </div>
  )
}

// --- 大圖預覽 ---
function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative max-w-full max-h-full">
        <img src={src} alt="Full Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        <button className="absolute top-4 right-4 bg-white/20 text-white rounded-full p-2"><X size={24}/></button>
      </div>
    </div>
  );
}

// --- 登入畫面 ---
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isUsingDemo = !manualConfig.apiKey || manualConfig.apiKey.includes("請填入");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isUsingDemo) return setError("請先設定 Firebase API Key");
    setLoading(true); setError('');
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (err) { setError('登入失敗，請檢查帳號密碼'); } 
    finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    if (isUsingDemo) return setError("請先設定 Firebase API Key");
    setLoading(true); setError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (err) { setError(`Google 登入失敗: ${err.message}`); } 
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Package size={32} className="text-indigo-600" /></div>
          <h1 className="text-2xl font-bold text-slate-800">聚鴻庫存系統</h1>
          <p className="text-slate-500 text-sm mt-1">請使用員工帳號登入</p>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex gap-2"><AlertCircle size={16}/>{error}</div>}
        <div className="space-y-4">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl" placeholder="Email" />
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl" placeholder="密碼" />
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg">{loading ? <Loader className="animate-spin" /> : '登入'}</button>
          <div className="relative my-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">或</span></div></div>
          <button type="button" onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white text-slate-700 border border-slate-300 py-3 rounded-xl font-bold shadow-sm flex justify-center gap-2">Google 登入</button>
        </div>
      </form>
    </div>
  );
}

// --- 主程式 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('inbound'); 
  const [inventory, setInventory] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsubInv = onSnapshot(inventoryRef, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInventory(items.sort(sortInventoryItems));
        setLoading(false);
    });

    const presenceRef = doc(db, 'artifacts', appId, 'public', 'data', 'presence', user.uid);
    const updatePresence = () => setDoc(presenceRef, { email: user.email, lastSeen: new Date().toISOString() }, { merge: true });
    updatePresence();
    const interval = setInterval(updatePresence, 60000); 

    const presenceColl = collection(db, 'artifacts', appId, 'public', 'data', 'presence');
    const unsubPresence = onSnapshot(presenceColl, (snapshot) => {
      const now = new Date();
      setOnlineUsers(snapshot.docs.map(d => ({id: d.id, ...d.data()})).filter(u => (now - new Date(u.lastSeen)) < 120000 && u.id !== user.uid));
    });

    return () => { unsubInv(); clearInterval(interval); unsubPresence(); deleteDoc(presenceRef).catch(()=>{}); };
  }, [user]);

  const showMsg = (type, text) => setNotification({ type, text });
  const handleLogout = () => { if (confirm('確定要登出嗎？')) signOut(auth); };

  if (isAuthChecking) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader className="animate-spin text-indigo-600" size={40} /></div>;
  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative">
      {notification && <NotificationModal type={notification.type} text={notification.text} onClose={() => setNotification(null)} />}
      <header className="bg-indigo-600 text-white p-4 shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2"><Package size={24} /><h1 className="text-xl font-bold tracking-tight">聚鴻塑膠庫存管理系統</h1></div>
          <div className="flex items-center gap-3">
             {onlineUsers.length > 0 && <div className="flex -space-x-2 mr-2">{onlineUsers.map(u => <div key={u.id} className="w-8 h-8 rounded-full bg-pink-500 border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">{formatUserName(u.email).charAt(0).toUpperCase()}</div>)}</div>}
             <div className="flex items-center gap-1 text-xs bg-indigo-700 py-1 px-2 rounded-lg border border-indigo-500 shadow-sm"><User size={12} /><span className="max-w-[100px] truncate font-mono">{formatUserName(user.email)}</span></div>
             <button onClick={handleLogout} className="text-white hover:text-indigo-200"><LogOut size={20} /></button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 w-full">
        {activeTab === 'inbound' && <TransactionForm mode="inbound" inventory={inventory} onSave={showMsg} currentUser={user} />}
        {activeTab === 'outbound' && <TransactionForm mode="outbound" inventory={inventory} onSave={showMsg} currentUser={user} />}
        {activeTab === 'search' && <InventorySearch inventory={inventory} onSave={showMsg} isDemoEnv={isDemoEnv} currentUser={user} />}
      </main>
      <div className="fixed bottom-28 right-4 z-10 pointer-events-none text-[10px] text-slate-400 opacity-60 font-mono">v260126</div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-6 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
        <div className="flex justify-around w-full max-w-7xl mx-auto">
          <NavButton active={activeTab === 'inbound'} onClick={() => setActiveTab('inbound')} icon={<PlusCircle size={20}/>} label="入庫" />
          <NavButton active={activeTab === 'outbound'} onClick={() => setActiveTab('outbound')} icon={<MinusCircle size={20}/>} label="出庫" />
          <NavButton active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={20}/>} label="庫存查詢" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-1/4 ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
      <span className="flex items-center justify-center">{icon}</span><span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

// --- 入庫與出庫共用表單 ---
function TransactionForm({ mode, inventory, onSave, currentUser }) {
  const [formPartNumber, setFormPartNumber] = useState(''); 
  const [selectedAttr, setSelectedAttr] = useState({ size: '', category: '', material: '', spec: '', color: '' });
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const matchingVariants = useMemo(() => {
    if (!formPartNumber) return [];
    return inventory.filter(i => i.partNumber?.toLowerCase() === formPartNumber.trim().toLowerCase());
  }, [formPartNumber, inventory]);

  const options = useMemo(() => ({
      sizes: [...new Set(matchingVariants.map(i => i.size || ''))],
      categories: [...new Set(matchingVariants.map(i => i.category))],
      materials: [...new Set(matchingVariants.map(i => i.material))],
      specs: [...new Set(matchingVariants.map(i => i.spec || ''))],
      colors: [...new Set(matchingVariants.map(i => i.color))]
  }), [matchingVariants]);

  const targetItem = useMemo(() => matchingVariants.find(i => 
      (i.size || '') === selectedAttr.size &&
      i.category === selectedAttr.category &&
      i.material === selectedAttr.material &&
      (i.spec || '') === selectedAttr.spec &&
      i.color === selectedAttr.color
  ), [matchingVariants, selectedAttr]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantity);
    if (!targetItem || isNaN(qty) || qty <= 0) return onSave('error', '資料不完整');
    if (mode === 'outbound' && targetItem.quantity < qty) return onSave('error', `庫存不足！剩 ${targetItem.quantity}`);

    setIsSubmitting(true);
    try {
        const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', targetItem.id);
        const oldQty = targetItem.quantity;
        const newQty = oldQty + (mode === 'inbound' ? qty : -qty);
        await updateDoc(itemRef, { 
            quantity: increment(mode === 'inbound' ? qty : -qty), 
            lastUpdated: new Date().toISOString(),
            lastEditor: currentUser.email 
        });
        await addAuditLog(mode === 'inbound' ? '入庫' : '出庫', targetItem.name, `料號: ${targetItem.partNumber}, 庫存: ${oldQty} -> ${newQty} (變動: ${qty})`, currentUser.email);
        onSave('success', `已${mode === 'inbound' ? '入庫' : '出庫'}並更新庫存`);
        setQuantity(''); 
    } catch (err) {
      onSave('error', `操作失敗`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 animate-in fade-in max-w-xl mx-auto">
      <h2 className={`text-lg font-bold flex items-center gap-2 ${mode === 'inbound' ? 'text-green-600' : 'text-orange-600'}`}>
        {mode === 'inbound' ? <PlusCircle size={22}/> : <MinusCircle size={22}/>}
        {mode === 'inbound' ? '物料入庫' : '物料出庫'}
      </h2>
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">料號</label>
        <div className="relative">
          <input type="text" value={formPartNumber} onChange={e => setFormPartNumber(e.target.value)} placeholder="輸入料號 (如: A001)" className="w-full p-3 bg-slate-50 border rounded-xl" />
          {matchingVariants.length > 0 && <div className="absolute right-3 top-3.5 text-green-500"><CheckCircle size={16}/></div>}
        </div>
      </div>
      {matchingVariants.length > 0 && (
        <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
           <div className="text-center mb-2"><span className="text-xs text-slate-400">對應品名</span><p className="text-lg font-bold text-slate-700">{matchingVariants[0].name}</p></div>
           {targetItem && targetItem.photo && <div className="flex justify-center mb-4 bg-gray-50 p-2 rounded-lg border border-slate-200"><div className="w-32 h-32 relative bg-white rounded-md border border-slate-200 overflow-hidden"><img src={targetItem.photo} alt="產品預覽" className="w-full h-full object-contain" /></div></div>}
           <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">尺寸</label><select value={selectedAttr.size} onChange={e => setSelectedAttr(p=>({...p, size: e.target.value}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg">{options.sizes.map((opt, i) => <option key={i} value={opt}>{opt || '(空白)'}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">分類</label><select value={selectedAttr.category} onChange={e => setSelectedAttr(p=>({...p, category: e.target.value}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg">{options.categories.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}</select></div>
           </div>
           {/* 其他選單省略細節以節省空間，邏輯同上 */}
           <div className="grid grid-cols-2 gap-4">
               <div><label className="block text-xs font-bold text-slate-500 mb-1">材質</label><select value={selectedAttr.material} onChange={e => setSelectedAttr(p=>({...p, material: e.target.value}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg">{options.materials.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}</select></div>
               <div><label className="block text-xs font-bold text-slate-500 mb-1">材質規格</label><select value={selectedAttr.spec} onChange={e => setSelectedAttr(p=>({...p, spec: e.target.value}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg">{options.specs.map((opt, i) => <option key={i} value={opt}>{opt || '(空白)'}</option>)}</select></div>
           </div>
           <div><label className="block text-xs font-bold text-slate-500 mb-1">顏色</label><select value={selectedAttr.color} onChange={e => setSelectedAttr(p=>({...p, color: e.target.value}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg">{options.colors.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}</select></div>
        </div>
      )}
      <div><label className="block text-xs font-bold text-slate-400 mb-1">數量</label><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" /></div>
      <button disabled={isSubmitting || !targetItem} className={`w-full py-4 rounded-xl text-white font-bold shadow-lg ${mode === 'inbound' ? 'bg-green-600' : 'bg-orange-600'}`}>{isSubmitting ? <Loader className="animate-spin mx-auto" /> : `確認${mode === 'inbound' ? '入庫' : '出庫'}`}</button>
    </form>
  );
}

// --- 庫存查詢頁面 (合併功能版) ---
function InventorySearch({ inventory, onSave, isDemoEnv, currentUser }) {
  const [currentFolder, setCurrentFolder] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [previewImage, setPreviewImage] = useState(null); 
  const [isEditMode, setIsEditMode] = useState(false); 
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false); 
  const [showLogModal, setShowLogModal] = useState(false);
  
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmBatchSave, setShowConfirmBatchSave] = useState(false);
  const [batchEditValues, setBatchEditValues] = useState({});

  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // Form states...
  const [formData, setFormData] = useState({ partNumber: '', name: '', size: '', sizeUnit: '英吋', category: '零件', material: '', spec: '', color: '', remarks: '', qty: '0', safety: '5000', photo: '' });
  const [colorMode, setColorMode] = useState('black');
  const [customColor, setCustomColor] = useState('');

  const folders = useMemo(() => {
    const map = {};
    inventory.forEach(item => {
      const key = (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase();
      if (!map[key]) map[key] = 0;
      map[key]++;
    });
    return Object.keys(map).sort();
  }, [inventory]);

  const displayItems = useMemo(() => {
    let list = [];
    if (globalSearch.trim()) {
      list = inventory.filter(item => item.partNumber?.toLowerCase().includes(globalSearch.toLowerCase()) || item.name?.toLowerCase().includes(globalSearch.toLowerCase()));
    } else if (currentFolder) {
      list = inventory.filter(item => (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase() === currentFolder);
    } else {
      return [];
    }
    return list.sort(sortInventoryItems);
  }, [currentFolder, inventory, globalSearch]);

  const handleGlobalSearchChange = (e) => { setGlobalSearch(e.target.value); if (e.target.value) setCurrentFolder(null); };
  const toggleEditMode = () => { if (isEditMode) { setIsEditMode(false); setIsDeleteMode(false); setIsBatchEditMode(false); setIsSuperAdmin(false); } else { setShowPwdModal(true); } };
  const handlePasswordSuccess = (superAdmin) => { setIsEditMode(true); setIsSuperAdmin(superAdmin); };
  
  // Batch Operations
  const toggleDeleteMode = () => { setIsDeleteMode(!isDeleteMode); setIsBatchEditMode(false); setSelectedIds(new Set()); };
  const toggleBatchEditMode = () => { if(isBatchEditMode) { setIsBatchEditMode(false); setBatchEditValues({}); } else { const vals = {}; displayItems.forEach(i => vals[i.id] = {...i}); setBatchEditValues(vals); setIsBatchEditMode(true); setIsDeleteMode(false); } };
  const handleSelect = (id) => { const s = new Set(selectedIds); if(s.has(id)) s.delete(id); else s.add(id); setSelectedIds(s); };
  const handleSelectAll = () => setSelectedIds(selectedIds.size === displayItems.length ? new Set() : new Set(displayItems.map(i => i.id)));
  const handleBatchChange = (id, field, value) => setBatchEditValues(p => ({...p, [id]: {...p[id], [field]: value}}));

  const executeBatchDelete = async () => {
    const batch = writeBatch(db);
    let count = 0;
    selectedIds.forEach(id => { batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id)); count++; });
    try { await batch.commit(); await addAuditLog('刪除', '多筆資料', `共刪除 ${count} 筆`, currentUser.email); onSave('success', `刪除 ${count} 筆`); setShowConfirmDelete(false); setIsDeleteMode(false); } catch(e) { onSave('error', '失敗'); }
  };

  const executeBatchSave = async () => {
    const batch = writeBatch(db);
    let count = 0;
    const updates = []; // To store logs
    Object.keys(batchEditValues).forEach(id => {
      const original = inventory.find(i => i.id === id);
      const target = batchEditValues[id];
      const diff = getDiff(original, target);
      if (diff) {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
        batch.update(ref, { ...target, quantity: parseInt(target.quantity), lastUpdated: new Date().toISOString(), lastEditor: currentUser.email });
        updates.push({ name: target.name, diff });
        count++;
      }
    });
    try { 
       await batch.commit(); 
       // Log updates individually or summary
       for (const u of updates) { await addAuditLog('修改', u.name, u.diff, currentUser.email); }
       onSave('success', `更新 ${count} 筆`); setShowConfirmBatchSave(false); setIsBatchEditMode(false); 
    } catch(e) { onSave('error', '失敗'); }
  };

  // CSV Import
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = event.target.result.split('\n');
      const batch = writeBatch(db);
      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].trim().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        if (cols.length >= 8) {
           const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
           batch.set(ref, {
             partNumber: cols[0], name: cols[1], size: cols[2], category: cols[3] || '零件', material: cols[4], spec: cols[5],
             color: cols[6], remarks: cols[7], quantity: parseInt(cols[8])||0, safetyStock: parseInt(cols[9])||5000, photo: cols[10]||'',
             lastUpdated: new Date().toISOString(), lastEditor: currentUser.email
           });
           count++;
        }
      }
      if (count > 0) { await batch.commit(); await addAuditLog('匯入', 'CSV 匯入', `新增 ${count} 筆`, currentUser.email); onSave('success', `匯入 ${count} 筆`); }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  // Batch Image
  const handleBatchImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !confirm(`匯入 ${files.length} 張圖片?`)) return;
    const map = {}; inventory.forEach(i => { if(i.partNumber) { const k = i.partNumber.toLowerCase(); if(!map[k]) map[k]=[]; map[k].push(i.id); } });
    
    let success = 0;
    let processed = 0;
    files.forEach(file => {
       const name = file.name.split('.')[0].toLowerCase();
       const ids = map[name];
       if (ids) {
         const reader = new FileReader();
         reader.onload = (ev) => {
            const img = new Image();
            img.onload = async () => {
               const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
               const MAX = 500; let w=img.width, h=img.height;
               if(w>h){if(w>MAX){h*=MAX/w;w=MAX}}else{if(h>MAX){w*=MAX/h;h=MAX}}
               canvas.width=w; canvas.height=h; ctx.drawImage(img,0,0,w,h);
               const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
               const updates = ids.map(id => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { photo: dataUrl, lastUpdated: new Date().toISOString(), lastEditor: currentUser.email }));
               await Promise.all(updates);
               success++;
               if (++processed === files.length) { await addAuditLog('匯入', '圖片', `配對 ${success} 張`, currentUser.email); onSave('success', `成功配對 ${success} 張`); e.target.value = null; }
            };
            img.src = ev.target.result;
         };
         reader.readAsDataURL(file);
       } else {
         if (++processed === files.length) { onSave('success', `成功配對 ${success} 張`); e.target.value = null; }
       }
    });
  };

  // Add/Edit Modal
  const openAddModal = (item) => {
    setEditingItem(item);
    setFormData({
      partNumber: item?.partNumber || '', name: item?.name || '', size: item?.size?.replace(/(mm|英吋)$/,'') || '', 
      sizeUnit: (item?.size?.includes('mm') ? 'mm' : '英吋'), category: item?.category || '零件',
      material: item?.material || '', spec: item?.spec || '', color: item?.color || '', 
      remarks: item?.remarks || '', qty: item?.quantity || '0', safety: item?.safetyStock || '5000', photo: item?.photo || ''
    });
    setColorMode(item?.color === '黑色' ? 'black' : 'custom');
    setCustomColor(item?.color !== '黑色' ? item?.color : '');
    setIsAdding(true);
  };

  const handleFormSave = async (e) => {
    e.preventDefault();
    if(isDemoEnv) return onSave('error', '請設定 Firebase');
    try {
      const fullSize = formData.size ? (formData.size.match(/mm|英吋/) ? formData.size : `${formData.size}${formData.sizeUnit}`) : '';
      const finalColor = colorMode === 'black' ? '黑色' : customColor;
      const data = {
        partNumber: formData.partNumber, name: formData.name, size: fullSize, category: formData.category,
        material: formData.material, spec: formData.spec, color: finalColor, remarks: formData.remarks,
        quantity: parseInt(formData.qty)||0, safetyStock: parseInt(formData.safety)||5000, photo: formData.photo,
        lastUpdated: new Date().toISOString(), lastEditor: currentUser.email
      };
      
      if (editingItem) {
        const diff = getDiff(editingItem, data);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', editingItem.id), data);
        await addAuditLog('修改', data.name, diff, currentUser.email);
        onSave('success', '已更新');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), data);
        await addAuditLog('新增', data.name, `料號: ${data.partNumber}`, currentUser.email);
        onSave('success', '已新增');
      }
      setIsAdding(false);
    } catch(e) { onSave('error', '失敗'); }
  };

  return (
    <div className="animate-in fade-in h-full flex flex-col">
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} onSuccess={handlePasswordSuccess} />}
      {showLogModal && <AuditLogModal onClose={() => setShowLogModal(false)} />}
      
      {showConfirmDelete && <ConfirmModal title="確認刪除？" content={`刪除 ${selectedIds.size} 筆`} onCancel={() => setShowConfirmDelete(false)} onConfirm={executeBatchDelete} />}
      {showConfirmBatchSave && <ConfirmModal title="確認儲存？" content="確認更新清單資料" onCancel={() => setShowConfirmBatchSave(false)} onConfirm={executeBatchSave} confirmColor="bg-indigo-600" confirmText="儲存" />}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
           <div className="flex items-center gap-2">
             {currentFolder && !globalSearch ? <button onClick={()=>setCurrentFolder(null)} className="text-indigo-600 font-bold flex gap-1"><ArrowLeft size={18}/> 返回</button> : <h2 className="text-lg font-bold text-slate-700 flex gap-2"><Search/> 庫存查詢</h2>}
           </div>
           <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={toggleEditMode} className={`flex gap-1 text-xs px-3 py-1.5 rounded-full ${isEditMode?'bg-orange-100 text-orange-600':'bg-slate-100'}`}>{isEditMode?<Unlock size={14}/>:<Lock size={14}/>} {isEditMode?(isSuperAdmin?'超級':'編輯'):'檢視'}</button>
              {isEditMode && <>
                 {isSuperAdmin && <button onClick={()=>setShowLogModal(true)} className="bg-purple-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><History size={14}/> 紀錄</button>}
                 {!isBatchEditMode && <button onClick={toggleBatchEditMode} className="bg-blue-50 text-blue-600 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Pencil size={14}/> 批次修改</button>}
                 {isBatchEditMode && <button onClick={()=>setShowConfirmBatchSave(true)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Save size={14}/> 儲存</button>}
                 <div className="relative"><input type="file" multiple accept="image/*" onChange={handleBatchImageUpload} className="absolute inset-0 opacity-0 cursor-pointer"/><button className="text-pink-600 bg-pink-50 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 pointer-events-none"><ImageIcon size={14}/> 批次圖片</button></div>
                 <button onClick={toggleDeleteMode} className={`p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 ${isDeleteMode?'bg-red-600 text-white':'bg-red-50 text-red-600'}`}><Trash size={14}/> 刪除</button>
                 <button onClick={()=>openAddModal(null)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><PlusCircle size={14}/> 新增</button>
              </>}
              <button onClick={()=>exportToCSV(displayItems, '庫存')} className="text-slate-500 flex gap-1 text-xs hover:text-indigo-600"><Download size={16}/> 匯出</button>
           </div>
        </div>
        <div className="relative"><input type="text" value={globalSearch} onChange={handleGlobalSearchChange} placeholder="搜尋料號或品名..." className="w-full p-3 pl-10 bg-white border border-slate-200 rounded-xl shadow-sm outline-none"/><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/></div>
      </div>

      {/* Content */}
      {!currentFolder && !globalSearch ? (
         <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {folders.map(f => <button key={f} onClick={()=>setCurrentFolder(f)} className="bg-white p-4 rounded-xl shadow-sm border flex flex-col items-center"><FolderOpen size={32} className="text-blue-400"/><span className="font-bold">{f}</span><span className="text-xs bg-slate-100 px-2 rounded">{inventory.filter(i=>(i.partNumber?.[0]||i.name?.[0]||'?').toUpperCase()===f).length}</span></button>)}
         </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
           {(isDeleteMode || isBatchEditMode) && <div className={`absolute top-0 left-0 right-0 p-2 z-10 flex justify-between ${isDeleteMode?'bg-red-50 text-red-700':'bg-blue-50 text-blue-700'}`}><span className="text-sm font-bold ml-2">{isDeleteMode?`選取 ${selectedIds.size} 筆`:'批次修改模式'}</span><button onClick={isDeleteMode?toggleDeleteMode:toggleBatchEditMode} className="bg-white px-3 py-1 rounded shadow-sm text-xs">取消</button>{isDeleteMode && <button onClick={()=>setShowConfirmDelete(true)} disabled={!selectedIds.size} className="bg-red-600 text-white px-3 py-1 rounded text-xs shadow-sm ml-2">刪除</button>}</div>}
           <div className={`p-3 border-b flex justify-between ${isEditMode?'bg-orange-50':'bg-blue-50'} ${(isDeleteMode||isBatchEditMode)?'mt-10':''}`}><h3 className="font-bold flex gap-2"><FolderOpen size={16}/> 清單</h3><span className="text-xs">共 {displayItems.length} 筆</span></div>
           <div className="overflow-auto max-h-[75vh]">
             <table className="w-full text-left text-xs sm:text-sm">
               <thead className="bg-slate-50 font-semibold border-b sticky top-0 z-10 shadow-sm">
                 <tr>
                   {isDeleteMode && <th className="p-2 w-10 text-center"><button onClick={handleSelectAll}><CheckSquare size={16}/></button></th>}
                   {['序號','圖','料號','品名','尺寸','分類','材質(規格)','顏色','備註','庫存'].map(h=><th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                   {isEditMode && !isDeleteMode && !isBatchEditMode && <th className="p-2 text-center">操作</th>}
                 </tr>
               </thead>
               <tbody className="divide-y">
                 {displayItems.map((item, idx) => {
                   const isLow = item.quantity < (item.safetyStock||5000);
                   const d = isBatchEditMode ? (batchEditValues[item.id] || item) : item;
                   return (
                     <tr key={item.id} className={`hover:bg-slate-50 ${selectedIds.has(item.id)?'bg-red-50':''}`}>
                       {isDeleteMode && <td className="p-2 text-center"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={()=>handleSelect(item.id)} className="w-4 h-4"/></td>}
                       <td className="p-2 text-center text-slate-400">{idx+1}</td>
                       <td className="p-2"><div className="w-10 h-10 bg-white border rounded flex items-center justify-center">{item.photo?<img src={item.photo} className="w-full h-full object-contain" onClick={()=>!isBatchEditMode&&setPreviewImage(item.photo)}/>:<ImageIcon size={16} className="text-slate-300"/>}</div></td>
                       {isBatchEditMode ? (
                          <>
                            <td className="p-2"><input value={d.partNumber} onChange={e=>handleBatchChange(item.id,'partNumber',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input value={d.name} onChange={e=>handleBatchChange(item.id,'name',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input value={d.size} onChange={e=>handleBatchChange(item.id,'size',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><select value={d.category} onChange={e=>handleBatchChange(item.id,'category',e.target.value)} className="border rounded w-full"><option>零件</option><option>成品</option></select></td>
                            <td className="p-2"><input value={d.material} onChange={e=>handleBatchChange(item.id,'material',e.target.value)} className="border rounded w-full mb-1" placeholder="材質"/><input value={d.spec} onChange={e=>handleBatchChange(item.id,'spec',e.target.value)} className="border rounded w-full" placeholder="規格"/></td>
                            <td className="p-2"><input value={d.color} onChange={e=>handleBatchChange(item.id,'color',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input value={d.remarks} onChange={e=>handleBatchChange(item.id,'remarks',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input type="number" value={d.quantity} onChange={e=>handleBatchChange(item.id,'quantity',e.target.value)} className="border rounded w-full text-right"/></td>
                          </>
                       ) : (
                          <>
                            <td className="p-2 font-bold">{item.partNumber}</td>
                            <td className="p-2 font-bold">{item.name}</td>
                            <td className="p-2">{item.size||'-'}</td>
                            <td className="p-2"><span className="border px-1 rounded">{item.category}</span></td>
                            <td className="p-2">{item.material||'-'} <span className="text-slate-400 text-xs">{item.spec}</span></td>
                            <td className="p-2">{item.color||'-'}</td>
                            <td className="p-2 text-xs">{item.remarks||'-'}</td>
                            <td className={`p-2 text-right font-bold ${isLow?'text-red-600':'text-blue-600'}`}>{item.quantity}</td>
                          </>
                       )}
                       {isEditMode && !isDeleteMode && !isBatchEditMode && <td className="p-2 flex justify-center"><button onClick={()=>openAddModal(item)} className="p-1 text-slate-400 hover:text-indigo-600"><Edit size={14}/></button></td>}
                     </tr>
                   )
                 })}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {isAdding && isEditMode && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleFormSave} className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between border-b pb-3"><h3 className="font-bold text-lg">{editingItem?'編輯':'新增'}資料</h3><button type="button" onClick={()=>setIsAdding(false)}><X/></button></div>
             {!editingItem && <div className="p-4 bg-slate-50 rounded-xl flex flex-col gap-2 mb-2"><div className="flex gap-2"><button type="button" onClick={downloadImportTemplate} className="flex-1 bg-white border py-2 rounded text-xs">下載範本</button><div className="relative flex-1"><input type="file" accept=".csv" onChange={handleImportCSV} className="absolute inset-0 opacity-0"/><button type="button" className="w-full bg-blue-600 text-white py-2 rounded text-xs">匯入檔案</button></div></div></div>}
             <div><label className="text-xs font-bold text-slate-400">料號 (必填)</label><input value={formData.partNumber} onChange={e=>setFormData({...formData, partNumber:e.target.value})} className="w-full p-2 border rounded" required/></div>
             <div><label className="text-xs font-bold text-slate-400">品名</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full p-2 border rounded" required/></div>
             <div className="relative"><input type="file" accept="image/*" className="hidden" id="modal-photo" onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');const ctx=c.getContext('2d');const M=500;let w=i.width,h=i.height;if(w>h){if(w>M){h*=M/w;w=M}}else{if(h>M){w*=M/h;h=M}}c.width=w;c.height=h;ctx.drawImage(i,0,0,w,h);setFormData(p=>({...p,photo:c.toDataURL('image/jpeg',0.5)}))};i.src=ev.target.result};r.readAsDataURL(f)}}} /><label htmlFor="modal-photo" className="block w-full p-2 border border-dashed rounded text-center text-slate-500 cursor-pointer"><Camera size={20} className="inline mr-1"/>{formData.photo?'更換':'上傳'}照片</label>{formData.photo && <img src={formData.photo} className="mt-2 w-full h-32 object-contain bg-slate-100 rounded"/>}</div>
             <div className="flex gap-2">
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">尺寸</label><input value={formData.size} onChange={e=>setFormData({...formData, size:e.target.value})} className="w-full p-2 border rounded" placeholder="5/8"/></div>
               <div className="w-24"><label className="text-xs font-bold text-slate-400">單位</label><select value={formData.sizeUnit} onChange={e=>setFormData({...formData, sizeUnit:e.target.value})} className="w-full p-2 border rounded"><option>英吋</option><option>mm</option></select></div>
             </div>
             <div className="flex gap-2">
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">分類</label><select value={formData.category} onChange={e=>setFormData({...formData, category:e.target.value})} className="w-full p-2 border rounded"><option>零件</option><option>成品</option></select></div>
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">材質</label><input value={formData.material} onChange={e=>setFormData({...formData, material:e.target.value})} className="w-full p-2 border rounded" required/></div>
             </div>
             <div><label className="text-xs font-bold text-slate-400">材質規格</label><input value={formData.spec} onChange={e=>setFormData({...formData, spec:e.target.value})} className="w-full p-2 border rounded"/></div>
             <div><label className="text-xs font-bold text-slate-400">顏色</label><div className="flex gap-2 mt-1"><label className="flex items-center"><input type="radio" checked={colorMode==='black'} onChange={()=>{setColorMode('black');setFormData(p=>({...p,color:'黑色'}))}} className="mr-1"/>黑色</label><label className="flex items-center"><input type="radio" checked={colorMode==='custom'} onChange={()=>setColorMode('custom')} className="mr-1"/>其他</label></div>{colorMode==='custom' && <input value={customColor} onChange={e=>{setCustomColor(e.target.value);setFormData(p=>({...p,color:e.target.value}))}} className="w-full p-2 border rounded mt-2" placeholder="輸入顏色"/>}</div>
             <div><label className="text-xs font-bold text-slate-400">備註</label><input value={formData.remarks} onChange={e=>setFormData({...formData, remarks:e.target.value})} className="w-full p-2 border rounded"/></div>
             <div className="flex gap-2">
               <div><label className="text-xs font-bold text-slate-400">庫存</label><input type="number" value={formData.qty} onChange={e=>setFormData({...formData, qty:e.target.value})} className="w-full p-2 border rounded" required/></div>
               <div><label className="text-xs font-bold text-slate-400">安全庫存</label><input type="number" value={formData.safety} onChange={e=>setFormData({...formData, safety:e.target.value})} className="w-full p-2 border rounded"/></div>
             </div>
             <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-2">儲存</button>
          </form>
        </div>
      )}
    </div>
  );
}
