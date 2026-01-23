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
  writeBatch
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signInWithPopup,      // 新增：彈出視窗登入
  GoogleAuthProvider,   // 新增：Google 驗證提供者
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
  User 
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
      safe(item.lastEditor || '-'), 
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
  const exampleRow = ["A-001", "範例螺絲A", "5/8", "零件", "不鏽鋼", "M5x10", "黑色", "無備註", "100", "5000", ""];
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

// --- 提示視窗組件 (Modal) ---
function NotificationModal({ type, text, onClose }) {
  if (!text) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs sm:max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className={`p-6 flex flex-col items-center justify-center ${type === 'error' ? 'bg-red-50' : 'bg-green-50'}`}>
          {type === 'error' ? (
            <div className="bg-red-100 p-3 rounded-full mb-3">
              <AlertCircle size={40} className="text-red-600" />
            </div>
          ) : (
            <div className="bg-green-100 p-3 rounded-full mb-3">
              <CheckCircle size={40} className="text-green-600" />
            </div>
          )}
          <h3 className={`text-xl font-bold ${type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
            {type === 'error' ? '操作失敗' : '操作成功'}
          </h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6 font-medium text-base break-words">{text}</p>
          <button 
            onClick={onClose}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-sm tracking-wide ${type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 確認視窗 (Confirm Modal) ---
function ConfirmModal({ title, content, onConfirm, onCancel, confirmText = "確認", confirmColor = "bg-red-600" }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6 flex flex-col items-center justify-center bg-slate-50">
           <div className="bg-slate-200 p-3 rounded-full mb-3">
              <AlertTriangle size={40} className="text-slate-600" />
           </div>
           <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6 font-medium text-base break-words">{content}</p>
          <div className="flex gap-3">
             <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
             <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl font-bold text-white ${confirmColor} hover:opacity-90 shadow-lg transition-transform active:scale-95`}>{confirmText}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 密碼輸入視窗 (管理員功能用) ---
function PasswordModal({ onClose, onSuccess }) {
  const [pwd, setPwd] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (pwd === '8355') {
      onSuccess();
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
        <input 
          type="password" 
          autoFocus
          className="w-full border-2 border-slate-200 p-3 rounded-xl mb-4 text-center focus:border-indigo-500 focus:outline-none text-lg tracking-widest"
          placeholder="●●●●"
          value={pwd} 
          onChange={e=>setPwd(e.target.value)} 
        />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">取消</button>
          <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">確認</button>
        </div>
      </form>
    </div>
  )
}

// --- 大圖預覽組件 ---
function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative max-w-full max-h-full">
        <img 
          src={src} 
          alt="Full Preview" 
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
        />
        <button className="absolute top-4 right-4 bg-white/20 text-white rounded-full p-2 backdrop-blur-sm hover:bg-white/40 transition-colors">
          <X size={24} />
        </button>
      </div>
    </div>
  );
}

// --- 登入畫面組件 ---
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
        setError('帳號或密碼錯誤');
      } else {
        setError('登入失敗，請檢查網路或聯繫管理員');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError('Google 登入失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">聚鴻庫存系統</h1>
          <p className="text-slate-500 text-sm mt-1">請使用員工帳號登入</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">密碼</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {loading ? <Loader className="animate-spin" size={20} /> : '登入'}
          </button>

          {/* 分隔線 */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">或</span>
            </div>
          </div>

          {/* Google 登入按鈕 */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-slate-700 border border-slate-300 py-3 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {/* Google G Icon SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            使用 Google 帳號登入
          </button>
        </div>
      </form>
    </div>
  );
}

// --- 主要組件 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('inbound'); 
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // 0. 自動載入 Tailwind CSS 樣式與 Viewport 設定
  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }

    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
  }, []);

  // 1. 初始化身份驗證 (監聽登入狀態)
  useEffect(() => {
    // 監聽 Firebase 登入狀態變化 (包含 Google 登入或 Email 登入)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 監聽資料庫
  useEffect(() => {
    if (!user) return;
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsubscribe = onSnapshot(inventoryRef, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const sortedItems = items.sort((a, b) => {
          if (a.name !== b.name) return a.name.localeCompare(b.name);
          if ((a.size || '') !== (b.size || '')) return (a.size || '').localeCompare(b.size || '');
          return (a.material || '').localeCompare(b.material || '');
        });
        setInventory(sortedItems);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        // 不再自動報錯，避免干擾，除非是嚴重錯誤
        if (err.code === 'permission-denied') {
             showMsg('error', '權限不足：請確認 Firebase 規則');
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const showMsg = (type, text) => {
    setNotification({ type, text });
  };

  const handleLogout = () => {
    if (confirm('確定要登出嗎？')) {
      signOut(auth);
    }
  };

  // 載入中畫面
  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  // 未登入顯示登入頁面
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative">
      {/* 彈出視窗 */}
      {notification && (
        <NotificationModal 
          type={notification.type} 
          text={notification.text} 
          onClose={() => setNotification(null)} 
        />
      )}

      {/* Header */}
      <header className="bg-indigo-600 text-white p-4 shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={24} />
            <h1 className="text-xl font-bold tracking-tight">聚鴻塑膠庫存管理系統</h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 text-xs bg-indigo-700 py-1 px-2 rounded-lg">
                <User size={12} />
                {/* 顯示 Email，若無 (如匿名) 則顯示 ID 前幾碼 */}
                <span className="max-w-[100px] truncate">{user.email || user.uid.slice(0, 6)}</span>
             </div>
             <button onClick={handleLogout} className="text-white hover:text-indigo-200">
                <LogOut size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 w-full">
        {activeTab === 'inbound' && <TransactionForm mode="inbound" inventory={inventory} onSave={showMsg} currentUser={user} />}
        {activeTab === 'outbound' && <TransactionForm mode="outbound" inventory={inventory} onSave={showMsg} currentUser={user} />}
        {activeTab === 'search' && <InventorySearch inventory={inventory} onSave={showMsg} isDemoEnv={isDemoEnv} currentUser={user} />}
      </main>

      {/* Footer Design Signature */}
      <div className="fixed bottom-24 right-4 z-10 pointer-events-none text-[10px] text-slate-400 opacity-80 font-sans">
        Design by Ivan x Gemini
      </div>

      {/* Tab Navigation */}
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
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-1/4 ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

// --- 入庫與出庫共用表單 ---
function TransactionForm({ mode, inventory, onSave, currentUser }) {
  const [formName, setFormName] = useState('');
  const [selectedAttr, setSelectedAttr] = useState({ size: '', category: '', material: '', spec: '', color: '' });
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  
  const matchingVariants = useMemo(() => {
    if (!formName) return [];
    return inventory.filter(i => i.name?.toLowerCase() === formName.trim().toLowerCase());
  }, [formName, inventory]);

  const options = useMemo(() => {
    return {
      sizes: [...new Set(matchingVariants.map(i => i.size || ''))],
      categories: [...new Set(matchingVariants.map(i => i.category))],
      materials: [...new Set(matchingVariants.map(i => i.material))],
      specs: [...new Set(matchingVariants.map(i => i.spec || ''))],
      colors: [...new Set(matchingVariants.map(i => i.color))]
    };
  }, [matchingVariants]);

  const targetItem = useMemo(() => {
    return matchingVariants.find(i => 
      (i.size || '') === selectedAttr.size &&
      i.category === selectedAttr.category &&
      i.material === selectedAttr.material &&
      (i.spec || '') === selectedAttr.spec &&
      i.color === selectedAttr.color
    );
  }, [matchingVariants, selectedAttr]);

  const handleNameChange = (val) => {
    setFormName(val);
    setNameError('');
    setSelectedAttr({ size: '', category: '', material: '', spec: '', color: '' });
    
    if (!val.trim()) return;

    const exists = inventory.some(i => i.name?.toLowerCase() === val.trim().toLowerCase());
    if (!exists) {
      setNameError('錯誤：資料庫無此料號');
    }
  };

  useEffect(() => {
    if (matchingVariants.length > 0) {
      setSelectedAttr(prev => ({
        size: options.sizes.length === 1 ? options.sizes[0] : prev.size,
        category: options.categories.length === 1 ? options.categories[0] : prev.category,
        material: options.materials.length === 1 ? options.materials[0] : prev.material,
        spec: options.specs.length === 1 ? options.specs[0] : prev.spec,
        color: options.colors.length === 1 ? options.colors[0] : prev.color,
      }));
    }
  }, [matchingVariants.length, options]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantity);
    if (!formName || isNaN(qty) || qty <= 0) {
      onSave('error', '請填寫正確資訊');
      return;
    }

    if (matchingVariants.length === 0) {
       onSave('error', '資料庫無此料號');
       return;
    }

    setIsSubmitting(true);
    try {
      if (targetItem) {
        const finalQty = mode === 'inbound' ? qty : -qty;
        
        if (mode === 'outbound' && targetItem.quantity < qty) {
          onSave('error', `庫存不足！剩 ${targetItem.quantity}`);
          setIsSubmitting(false);
          return;
        }

        const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', targetItem.id);
        await updateDoc(itemRef, { 
            quantity: increment(finalQty), 
            lastUpdated: new Date().toISOString(),
            lastEditor: currentUser.email // 記錄操作者
        });
        
        onSave('success', `已${mode === 'inbound' ? '入庫' : '出庫'}並更新庫存`);
        setQuantity(''); 
        setFormName('');
        setSelectedAttr({ size: '', category: '', material: '', spec: '', color: '' });
      } else {
        onSave('error', '請完整選擇規格');
      }
    } catch (err) {
      console.error(err);
      onSave('error', `操作失敗`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttrChange = (field, val) => {
    setSelectedAttr(prev => ({ ...prev, [field]: val }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 animate-in fade-in max-w-xl mx-auto">
      <h2 className={`text-lg font-bold flex items-center gap-2 ${mode === 'inbound' ? 'text-green-600' : 'text-orange-600'}`}>
        {mode === 'inbound' ? <PlusCircle size={22}/> : <MinusCircle size={22}/>}
        {mode === 'inbound' ? '物料入庫' : '物料出庫'}
      </h2>

      {/* 產品名稱 */}
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">產品名稱</label>
        <div className="relative">
          <input 
            type="text" 
            value={formName} 
            onChange={e => handleNameChange(e.target.value)} 
            placeholder="輸入料號 (如: S1)" 
            className={`w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${nameError ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500'}`} 
          />
          {matchingVariants.length > 0 && !nameError && (
             <div className="absolute right-3 top-3.5 text-green-500"><CheckCircle size={16}/></div>
          )}
        </div>
        {nameError && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertTriangle size={10}/> {nameError}</p>}
      </div>

      {matchingVariants.length > 0 && !nameError && (
        <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
           
           {targetItem && targetItem.photo && (
             <div className="flex justify-center mb-4 bg-gray-50 p-2 rounded-lg border border-slate-200">
               <div className="w-32 h-32 relative bg-white rounded-md border border-slate-200 overflow-hidden">
                 <img 
                   src={targetItem.photo} 
                   alt="產品預覽" 
                   className="w-full h-full object-contain" 
                 />
               </div>
             </div>
           )}

           <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">尺寸</label>
                <select 
                  value={selectedAttr.size} 
                  onChange={e => handleAttrChange('size', e.target.value)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {options.sizes.length > 1 && <option value="">請選擇</option>}
                  {options.sizes.map((opt, i) => <option key={i} value={opt}>{opt || '(空白)'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">分類</label>
                <select 
                  value={selectedAttr.category} 
                  onChange={e => handleAttrChange('category', e.target.value)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {options.categories.length > 1 && <option value="">請選擇</option>}
                  {options.categories.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                </select>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">材質</label>
                <select 
                  value={selectedAttr.material} 
                  onChange={e => handleAttrChange('material', e.target.value)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {options.materials.length > 1 && <option value="">請選擇</option>}
                  {options.materials.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">材質規格</label>
                <select 
                  value={selectedAttr.spec} 
                  onChange={e => handleAttrChange('spec', e.target.value)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {options.specs.length > 1 && <option value="">請選擇</option>}
                  {options.specs.map((opt, i) => <option key={i} value={opt}>{opt || '(空白)'}</option>)}
                </select>
              </div>
           </div>

           <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">顏色</label>
              <select 
                value={selectedAttr.color} 
                onChange={e => handleAttrChange('color', e.target.value)} 
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {options.colors.length > 1 && <option value="">請選擇</option>}
                {options.colors.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
              </select>
           </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">{mode === 'inbound' ? '入庫數量' : '出庫數量'}</label>
        <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      <button disabled={isSubmitting || !!nameError || (matchingVariants.length > 0 && !selectedAttr.material)} className={`w-full py-4 rounded-xl text-white font-bold shadow-lg transition-all active:scale-95 disabled:bg-slate-300 ${mode === 'inbound' ? 'bg-green-600' : 'bg-orange-600'}`}>
        {isSubmitting ? <Loader className="animate-spin mx-auto" size={24}/> : `確認${mode === 'inbound' ? '入庫' : '出庫'}`}
      </button>
    </form>
  );
}

// --- 庫存查詢頁面 (合併功能版) ---
function InventorySearch({ inventory, onSave, isDemoEnv, currentUser }) {
  const [currentFolder, setCurrentFolder] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [previewImage, setPreviewImage] = useState(null); // 大圖預覽狀態
  const [isEditMode, setIsEditMode] = useState(false); // 編輯模式開關
  const [showPwdModal, setShowPwdModal] = useState(false); // 密碼視窗開關
  
  // 批量操作模式
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmBatchSave, setShowConfirmBatchSave] = useState(false);
  const [batchEditValues, setBatchEditValues] = useState({}); // 暫存修改值

  // 編輯/新增相關狀態
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formName, setFormName] = useState('');
  const [formSizeVal, setFormSizeVal] = useState('');
  const [formSizeUnit, setFormSizeUnit] = useState('英吋'); 
  const [formCategory, setFormCategory] = useState('零件'); // 預設改為 零件
  const [formMaterial, setFormMaterial] = useState('');
  const [formSpec, setFormSpec] = useState(''); 
  const [formQty, setFormQty] = useState('0');
  const [formSafetyStock, setFormSafetyStock] = useState('5000'); 
  const [formPhoto, setFormPhoto] = useState(''); 
  const [formRemarks, setFormRemarks] = useState(''); 
  const [colorMode, setColorMode] = useState('black'); 
  const [customColorVal, setCustomColorVal] = useState('');

  // 1. 資料夾分類邏輯 (使用料號首字)
  const folders = useMemo(() => {
    const map = {};
    inventory.forEach(item => {
      // 優先使用料號首字，若無料號則用品名
      const key = (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase();
      if (!map[key]) map[key] = 0;
      map[key]++;
    });
    return Object.keys(map).sort();
  }, [inventory]);

  // 2. 清單內容 & 排序
  const displayItems = useMemo(() => {
    let list = [];
    if (globalSearch.trim()) {
      // 搜尋料號 或 品名
      list = inventory.filter(item => 
        item.partNumber?.toLowerCase().includes(globalSearch.toLowerCase()) || 
        item.name?.toLowerCase().includes(globalSearch.toLowerCase())
      );
    } else if (currentFolder) {
      list = inventory.filter(item => {
        const key = (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase();
        return key === currentFolder;
      });
    } else {
      return [];
    }

    return list.sort((a, b) => {
      if (a.partNumber !== b.partNumber) return (a.partNumber || '').localeCompare(b.partNumber || '');
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      if ((a.size || '') !== (b.size || '')) return (a.size || '').localeCompare(b.size || '');
      return (a.material || '').localeCompare(b.material || '');
    });
  }, [currentFolder, inventory, globalSearch]);

  const handleGlobalSearchChange = (e) => {
    setGlobalSearch(e.target.value);
    if (e.target.value) {
      setCurrentFolder(null); 
    }
  };

  // --- 密碼與模式切換邏輯 ---
  const toggleEditMode = () => {
    if (isEditMode) {
      setIsEditMode(false); // 關閉不需要密碼
      setIsDeleteMode(false); 
      setIsBatchEditMode(false);
      setBatchEditValues({});
    } else {
      setShowPwdModal(true); // 開啟需要驗證
    }
  };

  const handlePasswordSuccess = () => {
    setIsEditMode(true);
  };

  // --- 批量刪除邏輯 ---
  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode);
    setIsBatchEditMode(false); // 互斥
    setSelectedIds(new Set()); 
  };

  const handleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === displayItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayItems.map(i => i.id)));
    }
  };

  const executeBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
       const ref = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
       batch.delete(ref);
    });
    try {
      await batch.commit();
      onSave('success', `成功刪除 ${selectedIds.size} 筆資料`);
      setSelectedIds(new Set());
      setIsDeleteMode(false);
      setShowConfirmDelete(false);
    } catch (err) {
      console.error(err);
      onSave('error', '刪除失敗，請檢查網路或權限');
    }
  };

  // --- 批量修改邏輯 ---
  const toggleBatchEditMode = () => {
    if (isBatchEditMode) {
      // 取消修改
      setIsBatchEditMode(false);
      setBatchEditValues({});
    } else {
      // 進入修改模式
      const initialValues = {};
      displayItems.forEach(item => {
        initialValues[item.id] = { ...item };
      });
      setBatchEditValues(initialValues);
      setIsBatchEditMode(true);
      setIsDeleteMode(false); // 互斥
    }
  };

  const handleBatchChange = (id, field, value) => {
    setBatchEditValues(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const executeBatchSave = async () => {
    const batch = writeBatch(db);
    let count = 0;
    
    Object.keys(batchEditValues).forEach(id => {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
      const data = batchEditValues[id];
      batch.update(ref, {
        ...data,
        quantity: parseInt(data.quantity) || 0,
        lastUpdated: new Date().toISOString(),
        lastEditor: currentUser.email // 記錄操作者
      });
      count++;
    });

    try {
      await batch.commit();
      onSave('success', `成功更新 ${count} 筆資料`);
      setIsBatchEditMode(false);
      setBatchEditValues({});
      setShowConfirmBatchSave(false);
    } catch (err) {
      console.error(err);
      onSave('error', '更新失敗');
    }
  };


  // --- 匯入功能 (CSV Parser) ---
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm(`確定要匯入 ${file.name} 嗎？這將會新增資料到資料庫中。`)) {
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const rows = text.split('\n');
      
      let successCount = 0;
      let errorCount = 0;
      
      const batch = writeBatch(db); 
      let batchCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].trim();
        if (!row) continue;

        const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        
        // 欄位順序(11): 料號, 品名, 尺寸, 分類, 材質, 規格, 顏色, 備註, 庫存, 安全庫存, 照片
        if (cols.length >= 8) {
          try {
            const newItemRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
            batch.set(newItemRef, {
              partNumber: cols[0], // 料號
              name: cols[1],       // 品名
              size: cols[2],
              category: cols[3] || '零件',
              material: cols[4],
              spec: cols[5],
              color: cols[6],
              remarks: cols[7], 
              quantity: parseInt(cols[8]) || 0,
              safetyStock: parseInt(cols[9]) || 5000,
              photo: cols[10] || '', 
              lastUpdated: new Date().toISOString(),
              lastEditor: currentUser.email // 記錄操作者
            });
            batchCount++;
            successCount++;
          } catch (err) {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      }

      if (batchCount > 0) {
        try {
          await batch.commit();
          onSave('success', `匯入成功：新增 ${successCount} 筆資料`);
        } catch (err) {
          console.error(err);
          onSave('error', '匯入失敗：資料庫寫入錯誤');
        }
      } else {
        onSave('error', '匯入失敗：無有效資料或格式錯誤');
      }
      e.target.value = null; 
    };
    reader.readAsText(file);
  };
  
  // --- 批次圖片匯入 (料號配對) ---
  const handleBatchImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (!confirm(`確定要匯入 ${files.length} 張圖片嗎？將依據「料號」自動配對。`)) {
      e.target.value = null;
      return;
    }
    
    const partNumToIdsMap = {};
    inventory.forEach(item => {
      if (item.partNumber) {
        const lowerPartNum = item.partNumber.toLowerCase();
        if (!partNumToIdsMap[lowerPartNum]) {
          partNumToIdsMap[lowerPartNum] = [];
        }
        partNumToIdsMap[lowerPartNum].push(item.id);
      }
    });

    let successCount = 0;
    let failCount = 0;
    let processedCount = 0;

    const processFile = (file) => {
      const fileName = file.name.split('.')[0].toLowerCase(); // 檔名即料號
      const targetIds = partNumToIdsMap[fileName];

      if (targetIds && targetIds.length > 0) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX_DIM = 500; 
            let width = img.width;
            let height = img.height;
            if (width > height) {
               if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
            } else {
               if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

            try {
              const updates = targetIds.map(id => 
                updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), {
                  photo: dataUrl,
                  lastUpdated: new Date().toISOString(),
                  lastEditor: currentUser.email // 記錄操作者
                })
              );
              await Promise.all(updates);
              successCount++;
            } catch (err) {
              console.error(err);
            } finally {
              checkDone();
            }
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        failCount++;
        checkDone();
      }
    };

    const checkDone = () => {
      processedCount++;
      if (processedCount === files.length) {
        onSave('success', `圖片匯入完成：成功配對 ${successCount} 張 (料號)，${failCount} 張無對應料號`);
        e.target.value = null;
      }
    };

    files.forEach(processFile);
  };

  // --- 新增/編輯/刪除 邏輯 ---
  const openAddModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormPartNumber(item.partNumber || '');
      setFormName(item.name || '');
      // 嘗試保留原始輸入值
      const match = item.size ? item.size.match(/^([\d./-]+)\s*(mm|英吋)?$/) : null;
      if (match) {
        setFormSizeVal(match[1]);
        setFormSizeUnit(match[2] || '英吋');
      } else {
        setFormSizeVal(item.size || ''); 
        setFormSizeUnit('英吋');
      }
      setFormCategory(item.category === '成品' ? '整組' : (item.category || '零件')); 
      setFormMaterial(item.material || '');
      setFormSpec(item.spec || '');
      setFormQty(item.quantity);
      setFormSafetyStock(item.safetyStock || 5000);
      setFormPhoto(item.photo || ''); 
      setFormRemarks(item.remarks || ''); 

      if (item.color === '黑色') {
        setColorMode('black');
        setCustomColorVal('');
      } else {
        setColorMode('custom');
        setCustomColorVal(item.color || '');
      }
    } else {
      setEditingItem(null);
      setFormPartNumber('');
      setFormName('');
      setFormSizeVal('');
      setFormSizeUnit('英吋');
      setFormCategory('零件'); 
      setFormMaterial('');
      setFormSpec('');
      setFormQty('0');
      setFormSafetyStock(5000);
      setColorMode('black');
      setCustomColorVal('');
      setFormPhoto(''); 
      setFormRemarks(''); 
    }
    setIsAdding(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isDemoEnv && manualConfig.apiKey.includes("請填入")) {
      onSave('error', '請先在程式碼 manualConfig 填入您的 Firebase 設定！');
      return;
    }

    try {
      // 尺寸邏輯
      let fullSize = '';
      if (formSizeVal.trim() !== '') {
        if (formSizeVal.includes('mm') || formSizeVal.includes('英吋')) {
           fullSize = formSizeVal;
        } else {
           fullSize = `${formSizeVal}${formSizeUnit}`;
        }
      }

      const finalColor = colorMode === 'black' ? '黑色' : customColorVal;
      if (colorMode === 'custom' && !finalColor.trim()) {
        alert('請輸入顏色名稱');
        return;
      }

      const data = {
        partNumber: formPartNumber.trim(), // 料號
        name: formName.trim(), // 品名
        size: fullSize,
        category: formCategory,
        material: formMaterial,
        spec: formSpec,
        color: finalColor,
        quantity: parseInt(formQty) || 0,
        safetyStock: parseInt(formSafetyStock) || 5000, 
        photo: formPhoto, 
        remarks: formRemarks, 
        lastUpdated: new Date().toISOString(),
        lastEditor: currentUser.email // 記錄操作者
      };

      if (editingItem) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', editingItem.id), data);
        onSave('success', '資料更新成功');
      } else {
        const newId = crypto.randomUUID();
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', newId), data);
        onSave('success', '資料新增成功');
      }
      setIsAdding(false);
    } catch (err) { 
      console.error(err);
      if (err.code === 'permission-denied') {
        onSave('error', '儲存失敗：權限不足');
      } else {
        onSave('error', `儲存失敗: ${err.message}`); 
      }
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定要刪除嗎？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id));
      onSave('success', '已刪除');
    } catch (err) { onSave('error', '刪除失敗'); }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_DIM = 500; 
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        setFormPhoto(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="animate-in fade-in h-full flex flex-col">
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} onSuccess={handlePasswordSuccess} />}
      {showConfirmDelete && (
        <ConfirmModal 
          title="確認刪除？" 
          content={`您即將刪除 ${selectedIds.size} 筆資料，此動作無法復原。`}
          onCancel={() => setShowConfirmDelete(false)}
          onConfirm={executeBatchDelete}
        />
      )}
      {showConfirmBatchSave && (
        <ConfirmModal 
          title="確認儲存？" 
          content={`您即將批次更新此清單中的資料。`}
          onCancel={() => setShowConfirmBatchSave(false)}
          onConfirm={executeBatchSave}
          confirmText="確認儲存"
          confirmColor="bg-indigo-600"
        />
      )}

      {/* 搜尋列與功能區 */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {currentFolder && !globalSearch ? (
              <button onClick={() => setCurrentFolder(null)} className="text-indigo-600 font-bold flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors">
                <ArrowLeft size={18}/> 返回類別
              </button>
            ) : (
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <Search size={20} className="text-indigo-600"/> 庫存查詢
              </h2>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* 編輯模式開關 */}
            <button 
              onClick={toggleEditMode}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-all ${isEditMode ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}
            >
              {isEditMode ? <Unlock size={14}/> : <Lock size={14}/>}
              {isEditMode ? '編輯模式' : '檢視模式'}
            </button>

            {isEditMode && (
              <>
                {/* 1. 批次修改 / 儲存修改 */}
                {(currentFolder || globalSearch) && (
                   <button 
                     onClick={isBatchEditMode ? () => setShowConfirmBatchSave(true) : toggleBatchEditMode} 
                     className={`p-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-colors ${isBatchEditMode ? 'bg-indigo-600 text-white' : 'bg-blue-50 text-blue-600'}`}
                   >
                     {isBatchEditMode ? <Save size={14}/> : <Pencil size={14}/>} 
                     {isBatchEditMode ? '儲存修改' : '批次修改'}
                   </button>
                )}

                {/* 2. 批次圖片 */}
                <div className="relative">
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    onChange={handleBatchImageUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  />
                  <button className="text-pink-600 bg-pink-50 p-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 pointer-events-none">
                    <ImageIcon size={14}/> 批次圖片
                  </button>
                </div>

                {/* 3. 刪除項目 / 取消刪除 */}
                {(currentFolder || globalSearch) && (
                   <button 
                     onClick={toggleDeleteMode} 
                     className={`p-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-colors ${isDeleteMode ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'}`}
                   >
                     <Trash size={14}/> {isDeleteMode ? '取消刪除' : '刪除項目'}
                   </button>
                )}

                {/* 4. 新增 */}
                <button onClick={() => openAddModal(null)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95">
                  <PlusCircle size={14}/> 新增
                </button>
              </>
            )}

            <button 
              onClick={() => exportToCSV(displayItems.length > 0 ? displayItems : inventory, `庫存清單`)}
              className="text-slate-500 flex items-center gap-1 text-xs hover:text-indigo-600 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors"
            >
              <Download size={16} />
              匯出
            </button>
          </div>
        </div>

        {/* 全域搜尋 */}
        <div className="relative w-full">
          <input 
            type="text" 
            value={globalSearch}
            onChange={handleGlobalSearchChange}
            placeholder="輸入料號或品名搜尋..." 
            className="w-full p-3 pl-10 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 資料夾或清單 */}
      {!currentFolder && !globalSearch ? (
        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {folders.map(f => (
            <button 
              key={f} 
              onClick={() => setCurrentFolder(f)}
              className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center gap-2 hover:border-indigo-400 hover:shadow-md transition-all active:scale-95 group"
            >
              <FolderOpen size={32} className="text-blue-400 fill-blue-50 group-hover:text-blue-500" />
              <span className="font-bold text-lg text-slate-700">{f}</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {/* 計算數量時以料號首字為準，無則品名 */}
                {inventory.filter(i => (i.partNumber?.[0] || i.name?.[0] || '?').toUpperCase() === f).length} 項目
              </span>
            </button>
          ))}
          {folders.length === 0 && <p className="col-span-full text-center text-slate-400 py-10">尚無庫存資料</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-right-4 relative">
          
          {/* 批量刪除工具列 (浮動) */}
          {isDeleteMode && (
             <div className="absolute top-0 left-0 right-0 bg-red-50 p-2 flex justify-between items-center z-10 border-b border-red-200">
                <span className="text-red-700 font-bold text-sm ml-2">已選取 {selectedIds.size} 筆</span>
                <div className="flex gap-2">
                   <button onClick={toggleDeleteMode} className="bg-white text-slate-600 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">取消</button>
                   <button onClick={() => setShowConfirmDelete(true)} disabled={selectedIds.size === 0} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm disabled:opacity-50">確認刪除</button>
                </div>
             </div>
          )}

          {/* 批量修改工具列 (浮動) */}
          {isBatchEditMode && (
             <div className="absolute top-0 left-0 right-0 bg-blue-50 p-2 flex justify-between items-center z-10 border-b border-blue-200">
                <span className="text-blue-700 font-bold text-sm ml-2">批次修改模式</span>
                <div className="flex gap-2">
                   <button onClick={toggleBatchEditMode} className="bg-white text-slate-600 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">取消</button>
                   {/* 這裡的儲存按鈕移到上方工具列統一管理，或者這裡也保留一個 */}
                </div>
             </div>
          )}

          <div className={`border-b border-slate-200 p-3 flex justify-between items-center ${isEditMode ? 'bg-orange-50' : 'bg-blue-50'} ${(isDeleteMode || isBatchEditMode) ? 'mt-10' : ''}`}>
            <h3 className={`font-bold flex items-center gap-2 ${isEditMode ? 'text-orange-800' : 'text-blue-800'}`}>
              <FolderOpen size={16}/> {globalSearch ? '搜尋結果' : `${currentFolder} 類別清單`}
            </h3>
            <span className={`text-xs font-medium ${isEditMode ? 'text-orange-600' : 'text-blue-600'}`}>共 {displayItems.length} 筆</span>
          </div>
          
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  {isDeleteMode && (
                    <th className="p-2 sm:p-3 w-10 text-center bg-slate-50">
                       <button onClick={handleSelectAll} className="text-slate-500 hover:text-indigo-600">
                         <CheckSquare size={16} />
                       </button>
                    </th>
                  )}
                  <th className="p-2 sm:p-3 whitespace-nowrap w-10 text-center bg-slate-50">序號</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap w-14 bg-slate-50">圖</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">料號</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">品名</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">尺寸</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">分類</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">材質 (材質規格)</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">顏色</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap bg-slate-50">備註</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap text-right bg-slate-50">庫存</th>
                  {isEditMode && !isDeleteMode && !isBatchEditMode && <th className="p-2 sm:p-3 whitespace-nowrap text-center bg-slate-50">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayItems.map((item, index) => {
                  const isLowStock = item.quantity < (item.safetyStock || 5000);
                  const editData = isBatchEditMode ? (batchEditValues[item.id] || item) : item;

                  return (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(item.id) ? 'bg-red-50' : ''}`}>
                      {isDeleteMode && (
                        <td className="p-2 sm:p-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(item.id)} 
                            onChange={() => handleSelect(item.id)}
                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                          />
                        </td>
                      )}
                      <td className="p-2 sm:p-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                      <td className="p-2 sm:p-3">
                         <div className="w-10 h-10 bg-white border border-slate-200 rounded-md overflow-hidden flex items-center justify-center shadow-sm">
                          {item.photo ? <img src={item.photo} alt="圖" className="w-full h-full object-contain" onClick={() => !isBatchEditMode && setPreviewImage(item.photo)} /> : <ImageIcon size={16} className="text-slate-300" />}
                        </div>
                      </td>
                      
                      {/* 批次修改欄位 */}
                      {isBatchEditMode ? (
                        <>
                          <td className="p-2"><input type="text" value={editData.partNumber} onChange={(e) => handleBatchChange(item.id, 'partNumber', e.target.value)} className="w-full border rounded p-1 text-xs" /></td>
                          <td className="p-2"><input type="text" value={editData.name} onChange={(e) => handleBatchChange(item.id, 'name', e.target.value)} className="w-full border rounded p-1 text-xs" /></td>
                          <td className="p-2"><input type="text" value={editData.size} onChange={(e) => handleBatchChange(item.id, 'size', e.target.value)} className="w-full border rounded p-1 text-xs" /></td>
                          <td className="p-2">
                            <select value={editData.category} onChange={(e) => handleBatchChange(item.id, 'category', e.target.value)} className="w-full border rounded p-1 text-xs">
                               <option value="零件">零件</option>
                               <option value="成品">成品</option>
                            </select>
                          </td>
                          <td className="p-2">
                             <input type="text" value={editData.material} onChange={(e) => handleBatchChange(item.id, 'material', e.target.value)} className="w-full border rounded p-1 text-xs mb-1" placeholder="材質" />
                             <input type="text" value={editData.spec} onChange={(e) => handleBatchChange(item.id, 'spec', e.target.value)} className="w-full border rounded p-1 text-xs" placeholder="規格" />
                          </td>
                          <td className="p-2"><input type="text" value={editData.color} onChange={(e) => handleBatchChange(item.id, 'color', e.target.value)} className="w-full border rounded p-1 text-xs" /></td>
                          <td className="p-2"><input type="text" value={editData.remarks} onChange={(e) => handleBatchChange(item.id, 'remarks', e.target.value)} className="w-full border rounded p-1 text-xs" /></td>
                          <td className="p-2"><input type="number" value={editData.quantity} onChange={(e) => handleBatchChange(item.id, 'quantity', e.target.value)} className="w-full border rounded p-1 text-xs text-right" /></td>
                        </>
                      ) : (
                        // 一般檢視模式
                        <>
                          <td className="p-2 sm:p-3 font-bold text-slate-700">{item.partNumber}</td>
                          <td className="p-2 sm:p-3 font-bold text-slate-700">{item.name}</td>
                          <td className="p-2 sm:p-3 text-slate-600">{item.size || '-'}</td>
                          <td className="p-2 sm:p-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${item.category==='成品'?'bg-blue-50 text-blue-600 border-blue-100':'bg-orange-50 text-orange-600 border-orange-100'}`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="p-2 sm:p-3 text-slate-600">
                             {item.material || '-'} <span className="text-[10px] text-slate-400">{item.spec ? `(${item.spec})` : ''}</span>
                          </td>
                          <td className="p-2 sm:p-3 text-slate-600">{item.color || '-'}</td>
                          <td className="p-2 sm:p-3 text-slate-600 text-xs">{item.remarks || '-'}</td>
                          <td className={`p-2 sm:p-3 text-right font-mono font-bold ${isLowStock ? 'text-red-600' : 'text-blue-600'}`}>
                            {item.quantity}
                          </td>
                        </>
                      )}
                      
                      {isEditMode && !isDeleteMode && !isBatchEditMode && (
                        <td className="p-2 sm:p-3 flex justify-center gap-2">
                          <button onClick={() => openAddModal(item)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded shadow-sm border border-transparent hover:border-slate-200"><Edit size={14}/></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {displayItems.length === 0 && (
                  <tr>
                    <td colSpan={isEditMode ? (isDeleteMode ? 12 : 11) : 10} className="p-8 text-center text-slate-400">無符合資料</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯 Modal (只在編輯模式下啟用) */}
      {isAdding && isEditMode && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleSave} className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3 mb-2">
              <h3 className="font-bold text-lg text-slate-800">{editingItem ? '編輯資料' : '新增資料'}</h3>
              <button type="button" onClick={() => setIsAdding(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            {/* 新增模式下的「匯入 Excel」區塊 */}
            {!editingItem && (
              <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="text-green-600" size={20} />
                  <span className="font-bold text-slate-700 text-sm">批次匯入 (Excel/CSV)</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={downloadImportTemplate} 
                    className="flex-1 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Download size={14}/> 下載範本
                  </button>
                  <div className="relative flex-1">
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleImportCSV} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    />
                    <button 
                      type="button" 
                      className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 pointer-events-none"
                    >
                      <Upload size={14}/> 匯入檔案
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* 料號 (必填) */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">料號 (必填)</label>
                <input type="text" value={formPartNumber} onChange={e => setFormPartNumber(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">品名</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
              </div>

              <div>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                  id="photo-upload"
                  onChange={handlePhotoUpload}
                />
                <label 
                  htmlFor="photo-upload" 
                  className="flex items-center justify-center gap-2 w-full p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <Camera size={20} />
                  {formPhoto ? '更換照片' : '新增照片 (開啟相機)'}
                </label>
                {formPhoto && (
                  <div className="mt-2 relative group aspect-square w-full bg-gray-100 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center">
                     <img src={formPhoto} alt="Preview" className="w-full h-full object-contain" />
                     <button 
                       type="button" 
                       onClick={() => setFormPhoto('')} 
                       className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600"
                     >
                       <X size={16} />
                     </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">尺寸 (選填)</label>
                <div className="flex gap-2">
                  <input type="number" step="any" value={formSizeVal} onChange={e => setFormSizeVal(e.target.value)} placeholder="可空白 (如 5/8)" className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <select value={formSizeUnit} onChange={e => setFormSizeUnit(e.target.value)} className="w-24 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="英吋">英吋</option>
                    <option value="mm">mm</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">分類</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="零件">零件</option>
                    <option value="成品">成品</option>
                  </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-1">材質 (必填)</label>
                   <input type="text" value={formMaterial} onChange={e => setFormMaterial(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
                </div>
              </div>

              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-1">材質規格 (可空白)</label>
                 <input type="text" value={formSpec} onChange={e => setFormSpec(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">顏色</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                   <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="colorMode" checked={colorMode === 'black'} onChange={() => setColorMode('black')} className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm">黑色</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="colorMode" checked={colorMode === 'custom'} onChange={() => setColorMode('custom')} className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm">有色 (其他)</span>
                      </label>
                   </div>
                   {colorMode === 'custom' && (
                     <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
                       <Palette size={16} className="text-slate-400"/>
                       <input 
                         type="text" 
                         value={customColorVal} 
                         onChange={e => setCustomColorVal(e.target.value)} 
                         placeholder="請輸入顏色名稱或色號" 
                         className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                         autoFocus
                       />
                     </div>
                   )}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">備註 (選填)</label>
                <input type="text" value={formRemarks} onChange={e => setFormRemarks(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">庫存數量</label>
                  <input type="number" value={formQty} onChange={e => setFormQty(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">安全庫存</label>
                  <input type="number" value={formSafetyStock} onChange={e => setFormSafetyStock(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-transform active:scale-95 mt-4">確認儲存</button>
          </form>
        </div>
      )}
    </div>
  );
}
