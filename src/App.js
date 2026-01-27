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
  apiKey: "請填入您的_apiKey",
  authDomain: "請填入您的_authDomain",
  projectId: "請填入您的_projectId",
  storageBucket: "請填入您的_storageBucket",
  messagingSenderId: "請填入您的_messagingSenderId",
  appId: "請填入您的_appId"
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

// --- 工具函式：數值格式化 ---
const formatVal = (v) => (v === undefined || v === null) ? '' : String(v);

// --- 工具函式：生成產品識別字串 ---
const getProductIdentity = (item) => {
  if (!item) return '未知產品';
  const specStr = item.spec ? `(${item.spec})` : '';
  return `[${item.partNumber}] ${item.name} - ${item.material}${specStr} ${item.color}`;
};

// --- 工具函式：比對物件差異 ---
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
const addAuditLog = async (action, productIdentity, details, userEmail) => {
  if (!userEmail) return;
  try {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), {
      timestamp: new Date().toISOString(),
      user: userEmail,
      action: action,
      product: productIdentity, 
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
  const headers = ["序號", "料號", "品名", "尺寸", "分類", "材質", "材質規格", "顏色", "備註", "庫存數量", "安全庫存", "照片", "最後操作者", "最後更新時間"];
  
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
      safe(item.photo ? '有圖片' : ''), 
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

// --- 操作紀錄視窗 (Log Modal) ---
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-in zoom-in-95">
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
                   <th className="p-3">產品詳情 (料號 | 品名 | 規格 | 顏色)</th>
                   <th className="p-3">變更內容</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-mono text-blue-600">{formatUserName(log.user)}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 font-bold">{log.action}</span></td>
                    <td className="p-3 font-bold text-slate-700">{log.product}</td>
                    <td className="p-3 text-slate-500 break-all max-w-[250px]">{log.details}</td>
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
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isUsingDemo = !manualConfig.apiKey || manualConfig.apiKey.includes("請填入");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isUsingDemo) {
       setError("請先在程式碼中填入您的 Firebase 設定 (manualConfig)");
       return;
    }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('帳號或密碼錯誤');
      } else {
        setError(`登入失敗 (${err.code})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isUsingDemo) {
       setError("請先在程式碼中填入您的 Firebase 設定 (manualConfig)");
       return;
    }
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError(`Google 登入失敗 (${err.code})：請確認已在 Firebase Console 新增此網域`);
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
          
          {isUsingDemo && (
            <div className="mt-2 p-2 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200">
               ⚠️ 注意：目前未設定 Firebase API Key，無法進行真實登入。請修改程式碼。
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2 break-all">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
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

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">或</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-slate-700 border border-slate-300 py-3 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center gap-2"
          >
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
  const [onlineUsers, setOnlineUsers] = useState([]); 
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 監聽資料庫與線上狀態
  useEffect(() => {
    if (!user) return;

    // A. 監聽庫存
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsubInv = onSnapshot(inventoryRef, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInventory(items.sort(sortInventoryItems));
        setLoading(false);
    }, (err) => {
        console.error(err);
        if (err.code === 'permission-denied') showMsg('error', '權限不足：請確認 Firebase 規則');
        setLoading(false);
    });

    // B. 線上狀態
    const presenceRef = doc(db, 'artifacts', appId, 'public', 'data', 'presence', user.uid);
    const updatePresence = () => setDoc(presenceRef, { email: user.email, lastSeen: new Date().toISOString() }, { merge: true });
    updatePresence();
    const interval = setInterval(updatePresence, 60000); 

    // C. 監聽其他使用者
    const presenceColl = collection(db, 'artifacts', appId, 'public', 'data', 'presence');
    const unsubPresence = onSnapshot(presenceColl, (snapshot) => {
      const now = new Date();
      setOnlineUsers(snapshot.docs.map(d => ({id: d.id, ...d.data()})).filter(u => (now - new Date(u.lastSeen)) < 120000 && u.id !== user.uid));
    });

    return () => {
      unsubInv(); clearInterval(interval); unsubPresence();
      deleteDoc(presenceRef).catch(()=>{}); 
    };
  }, [user]);

  const showMsg = (type, text) => {
    setNotification({ type, text });
  };

  const handleLogout = () => {
    if (confirm('確定要登出嗎？')) {
      signOut(auth);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

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
             {onlineUsers.length > 0 && (
               <div className="flex -space-x-2 mr-2">
                 {onlineUsers.map(u => (
                   <div key={u.id} className="w-8 h-8 rounded-full bg-pink-500 border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={u.email}>
                     {formatUserName(u.email).charAt(0).toUpperCase()}
                   </div>
                 ))}
               </div>
             )}
             <div className="flex items-center gap-1 text-xs bg-indigo-700 py-1 px-2 rounded-lg border border-indigo-500 shadow-sm">
                <User size={12} />
                <span className="max-w-[100px] truncate font-mono">{formatUserName(user.email)}</span>
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

      {/* Footer Version */}
      <div className="fixed bottom-28 right-4 z-10 pointer-events-none text-[10px] text-slate-400 opacity-60 font-mono">
        v260126
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
  const [formPartNumber, setFormPartNumber] = useState(''); 
  const [selectedAttr, setSelectedAttr] = useState({ size: '', category: '', material: '', spec: '', color: '' });
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  
  const matchingVariants = useMemo(() => {
    if (!formPartNumber) return [];
    return inventory.filter(i => i.partNumber?.toLowerCase() === formPartNumber.trim().toLowerCase());
  }, [formPartNumber, inventory]);

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

  const handlePartNumberChange = (val) => {
    setFormPartNumber(val);
    setNameError('');
    setSelectedAttr({ size: '', category: '', material: '', spec: '', color: '' });
    
    if (!val.trim()) return;

    const exists = inventory.some(i => i.partNumber?.toLowerCase() === val.trim().toLowerCase());
    if (!exists) {
      setNameError('錯誤：資料庫無此料號');
    }
  };

  useEffect(() => {
    if (matchingVariants.length > 0) {
      setSelectedAttr(prev => ({
        size: options.sizes.length === 1 ? options.sizes[0] : prev.size,
        category: options.categories.length > 0 ? options.categories[0] : '',
        material: options.materials.length === 1 ? options.materials[0] : prev.material,
        spec: options.specs.length === 1 ? options.specs[0] : prev.spec,
        color: options.colors.length === 1 ? options.colors[0] : prev.color,
      }));
    }
  }, [matchingVariants.length, options]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantity);
    if (!formPartNumber || isNaN(qty) || qty <= 0) {
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
            lastEditor: currentUser.email 
        });

        await addAuditLog(
            mode === 'inbound' ? '入庫' : '出庫', 
            getProductIdentity(targetItem), 
            `庫存: ${targetItem.quantity} -> ${targetItem.quantity + finalQty} (變動: ${qty})`, 
            currentUser.email
        );
        
        onSave('success', `已${mode === 'inbound' ? '入庫' : '出庫'}並更新庫存`);
        setQuantity(''); 
        setFormPartNumber('');
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

      {/* 料號輸入 */}
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">料號</label>
        <div className="relative">
          <input 
            type="text" 
            value={formPartNumber} 
            onChange={e => handlePartNumberChange(e.target.value)} 
            placeholder="輸入料號 (如: A001)" 
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
           
           {/* 顯示對應的品名 */}
           <div className="text-center mb-2">
             <span className="text-xs text-slate-400">對應品名</span>
             <p className="text-lg font-bold text-slate-700">{matchingVariants[0].name}</p>
           </div>

           {/* 顯示產品照片 */}
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
                  {/* 使用資料庫現有分類 + 預設 */}
                  <option value="零件">零件</option>
                  <option value="成品">成品</option>
                  {/* 如果需要動態分類，這裡也可以讀取 inventory 的 category */}
                </select>
              </div>
           </div>
           
           {/* 其他欄位... */}
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
  const [previewImage, setPreviewImage] = useState(null); 
  const [isEditMode, setIsEditMode] = useState(false); 
  const [showPwdModal, setShowPwdModal] = useState(false); 
  const [showLogModal, setShowLogModal] = useState(false); 
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); 
  
  // 批量操作
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmBatchSave, setShowConfirmBatchSave] = useState(false);
  const [batchEditValues, setBatchEditValues] = useState({}); 

  // 新增/編輯
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPartNumber, setFormPartNumber] = useState(''); 
  const [formSizeVal, setFormSizeVal] = useState('');
  const [formSizeUnit, setFormSizeUnit] = useState('英吋'); 
  const [formCategory, setFormCategory] = useState(''); 
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
      const key = (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase();
      if (!map[key]) map[key] = 0;
      map[key]++;
    });
    return Object.keys(map).sort();
  }, [inventory]);

  // 計算該資料夾內特有的分類，用於新增/編輯時的 Datalist 建議
  const folderCategories = useMemo(() => {
    if (!currentFolder && !globalSearch) return [];
    
    // 如果在特定資料夾，只取該資料夾的分類；如果是全域搜尋，取搜尋結果的分類
    const targetItems = globalSearch 
       ? inventory.filter(i => i.partNumber?.toLowerCase().includes(globalSearch.toLowerCase()) || i.name?.toLowerCase().includes(globalSearch.toLowerCase()))
       : inventory.filter(i => (i.partNumber?.[0] || i.name?.[0] || '?').toUpperCase() === currentFolder);

    const cats = new Set(['零件', '成品']); // 預設必有
    targetItems.forEach(i => { if(i.category) cats.add(i.category) });
    return [...cats].sort();
  }, [currentFolder, globalSearch, inventory]);


  // 2. 清單內容 & 排序
  const displayItems = useMemo(() => {
    let list = inventory;

    if (globalSearch.trim()) {
      list = list.filter(item => 
        item.partNumber?.toLowerCase().includes(globalSearch.toLowerCase()) || 
        item.name?.toLowerCase().includes(globalSearch.toLowerCase())
      );
    } else if (currentFolder) {
      list = list.filter(item => {
        const key = (item.partNumber?.[0] || item.name?.[0] || '?').toUpperCase();
        return key === currentFolder;
      });
    } else {
      return [];
    }

    return list.sort(sortInventoryItems);
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
      setIsEditMode(false); 
      setIsDeleteMode(false); 
      setIsBatchEditMode(false);
      setBatchEditValues({});
      setIsSuperAdmin(false);
    } else {
      setShowPwdModal(true);
    }
  };

  const handlePasswordSuccess = (superAdmin) => {
    setIsEditMode(true);
    setIsSuperAdmin(superAdmin);
  };

  // --- 批量刪除/修改/匯入 (省略重複代碼，邏輯相同) ---
  const toggleDeleteMode = () => { setIsDeleteMode(!isDeleteMode); setIsBatchEditMode(false); setSelectedIds(new Set()); };
  const toggleBatchEditMode = () => {
    if (isBatchEditMode) { setIsBatchEditMode(false); setBatchEditValues({}); } 
    else {
      const initialValues = {};
      displayItems.forEach(item => { initialValues[item.id] = { ...item }; });
      setBatchEditValues(initialValues);
      setIsBatchEditMode(true);
      setIsDeleteMode(false);
    }
  };
  const handleBatchChange = (id, field, value) => { setBatchEditValues(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); };
  const handleSelect = (id) => { const s = new Set(selectedIds); if(s.has(id)) s.delete(id); else s.add(id); setSelectedIds(s); };
  const handleSelectAll = () => { setSelectedIds(selectedIds.size === displayItems.length ? new Set() : new Set(displayItems.map(i => i.id))); };

  const executeBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    let count = 0;
    const deletedItems = [];
    selectedIds.forEach(id => {
       const item = inventory.find(i => i.id === id);
       if (item) deletedItems.push(item);
       batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id));
       count++;
    });
    try {
      await batch.commit();
      for (const item of deletedItems) await addAuditLog('刪除', getProductIdentity(item), '刪除資料', currentUser.email);
      onSave('success', `成功刪除 ${count} 筆`);
      setSelectedIds(new Set());
      setIsDeleteMode(false);
      setShowConfirmDelete(false);
    } catch (err) { onSave('error', '失敗'); }
  };

  const executeBatchSave = async () => {
    const batch = writeBatch(db);
    let count = 0;
    const logs = [];
    Object.keys(batchEditValues).forEach(id => {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
      const data = batchEditValues[id];
      const original = inventory.find(i => i.id === id);
      const diff = getDiff(original, data);
      if (diff) {
        batch.update(ref, { ...data, quantity: parseInt(data.quantity)||0, lastUpdated: new Date().toISOString(), lastEditor: currentUser.email });
        logs.push({ item: data, diff });
        count++;
      }
    });
    try {
      await batch.commit();
      for (const log of logs) await addAuditLog('批次修改', getProductIdentity(log.item), log.diff, currentUser.email);
      onSave('success', `更新 ${count} 筆`);
      setIsBatchEditMode(false);
      setBatchEditValues({});
      setShowConfirmBatchSave(false);
    } catch (err) { onSave('error', '失敗'); }
  };

  // --- CSV Import ---
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(`匯入 ${file.name}?`)) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = event.target.result.split('\n');
      const batch = writeBatch(db);
      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].trim().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        if (cols.length >= 8) {
           const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
           const newItem = {
             partNumber: cols[0], name: cols[1], size: cols[2], category: cols[3] || '零件', material: cols[4], spec: cols[5],
             color: cols[6], remarks: cols[7], quantity: parseInt(cols[8])||0, safetyStock: parseInt(cols[9])||5000, photo: cols[10]||'',
             lastUpdated: new Date().toISOString(), lastEditor: currentUser.email
           };
           batch.set(ref, newItem);
           count++;
        }
      }
      if (count > 0) { await batch.commit(); await addAuditLog('匯入', 'CSV', `新增 ${count} 筆`, currentUser.email); onSave('success', `匯入 ${count} 筆`); }
      e.target.value = null;
    };
    reader.readAsText(file);
  };
  
  // --- Batch Image ---
  const handleBatchImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !confirm(`匯入 ${files.length} 張圖?`)) return;
    const map = {}; inventory.forEach(i => { if(i.partNumber) { const k = i.partNumber.toLowerCase(); if(!map[k]) map[k]=[]; map[k].push(i.id); } });
    let success = 0; let processed = 0;
    const checkDone = async () => { processed++; if (processed === files.length) { await addAuditLog('匯入', '圖片', `配對 ${success} 張`, currentUser.email); onSave('success', `配對 ${success} 張`); e.target.value = null; } };
    files.forEach(file => {
       const name = file.name.split('.')[0].toLowerCase();
       const ids = map[name];
       if (ids) {
         const reader = new FileReader();
         reader.onload = (ev) => {
            const img = new Image();
            img.onload = async () => {
               const c = document.createElement('canvas'); const ctx = c.getContext('2d');
               const M = 500; let w=img.width, h=img.height;
               if(w>h){if(w>M){h*=M/w;w=M}}else{if(h>M){w*=M/h;h=M}}
               c.width=w; c.height=h; ctx.drawImage(img,0,0,w,h);
               const url = c.toDataURL('image/jpeg', 0.5);
               const updates = ids.map(id => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { photo: url, lastUpdated: new Date().toISOString(), lastEditor: currentUser.email }));
               await Promise.all(updates);
               success++;
               checkDone();
            };
            img.src = ev.target.result;
         };
         reader.readAsDataURL(file);
       } else { checkDone(); }
    });
  };

  // --- Add/Edit Modal ---
  const openAddModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormPartNumber(item.partNumber||''); setFormName(item.name||'');
      const match = item.size ? item.size.match(/^([\d./-]+)\s*(mm|英吋)?$/) : null;
      if (match) { setFormSizeVal(match[1]); setFormSizeUnit(match[2]||'英吋'); } else { setFormSizeVal(item.size||''); setFormSizeUnit('英吋'); }
      // 分類如果不在預設中，也直接顯示
      setFormCategory(item.category||'零件'); setFormMaterial(item.material||''); setFormSpec(item.spec||'');
      setFormQty(item.quantity); setFormSafetyStock(item.safetyStock||5000); setFormPhoto(item.photo||''); setFormRemarks(item.remarks||'');
      if (item.color === '黑色') { setColorMode('black'); setCustomColorVal(''); } else { setColorMode('custom'); setCustomColorVal(item.color||''); }
    } else {
      setEditingItem(null); setFormPartNumber(''); setFormName(''); setFormSizeVal(''); setFormSizeUnit('英吋');
      setFormCategory('零件'); setFormMaterial(''); setFormSpec(''); setFormQty('0'); setFormSafetyStock(5000);
      setFormPhoto(''); setFormRemarks(''); setColorMode('black'); setCustomColorVal('');
    }
    setIsAdding(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isDemoEnv && manualConfig.apiKey.includes("請填入")) return onSave('error', '請設定 Firebase');
    try {
      const fullSize = formSizeVal.trim() !== '' ? (formSizeVal.match(/mm|英吋/) ? formSizeVal : `${formSizeVal}${formSizeUnit}`) : '';
      const finalColor = colorMode === 'black' ? '黑色' : customColorVal;
      // 若使用者有輸入自訂分類，直接存入 (不強制只能選 list 內的)
      const data = {
        partNumber: formPartNumber.trim(), name: formName.trim(), size: fullSize, category: formCategory.trim(),
        material: formMaterial, spec: formSpec, color: finalColor, quantity: parseInt(formQty)||0,
        safetyStock: parseInt(formSafetyStock)||5000, photo: formPhoto, remarks: formRemarks,
        lastUpdated: new Date().toISOString(), lastEditor: currentUser.email
      };

      if (editingItem) {
        const diff = getDiff(editingItem, data);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', editingItem.id), data);
        await addAuditLog('修改', getProductIdentity(data), diff, currentUser.email);
        onSave('success', '已更新');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), data);
        await addAuditLog('新增', getProductIdentity(data), '新增資料', currentUser.email);
        onSave('success', '已新增');
      }
      setIsAdding(false);
    } catch (err) { onSave('error', '失敗'); }
  };

  // --- Photo Upload for Modal ---
  const handleModalPhoto = (e) => {
     const f = e.target.files[0]; if(!f) return;
     const r = new FileReader();
     r.onload = (ev) => {
        const i = new Image();
        i.onload = () => {
           const c = document.createElement('canvas'); const ctx = c.getContext('2d');
           const M = 500; let w=i.width, h=i.height;
           if(w>h){if(w>M){h*=M/w;w=M}}else{if(h>M){w*=M/h;h=M}}
           c.width=w; c.height=h; ctx.drawImage(i,0,0,w,h);
           setFormPhoto(c.toDataURL('image/jpeg', 0.5));
        };
        i.src = ev.target.result;
     };
     r.readAsDataURL(f);
  };

  return (
    <div className="animate-in fade-in h-full flex flex-col">
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} onSuccess={handlePasswordSuccess} />}
      {showLogModal && <AuditLogModal onClose={() => setShowLogModal(false)} />}
      
      {showConfirmDelete && <ConfirmModal title="確認刪除？" content={`刪除 ${selectedIds.size} 筆`} onCancel={() => setShowConfirmDelete(false)} onConfirm={executeBatchDelete} />}
      {showConfirmBatchSave && <ConfirmModal title="確認儲存？" content="確認更新清單" onCancel={() => setShowConfirmBatchSave(false)} onConfirm={executeBatchSave} confirmColor="bg-indigo-600" confirmText="儲存" />}

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {currentFolder && !globalSearch ? <button onClick={()=>setCurrentFolder(null)} className="text-indigo-600 font-bold flex gap-1"><ArrowLeft size={18}/> 返回</button> : <h2 className="text-lg font-bold text-slate-700 flex gap-2"><Search/> 庫存查詢</h2>}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={toggleEditMode} className={`flex gap-1 text-xs px-3 py-1.5 rounded-full ${isEditMode?'bg-orange-100 text-orange-600':'bg-slate-100'}`}>{isEditMode?<Unlock size={14}/>:<Lock size={14}/>} {isEditMode?(isSuperAdmin?'超級':'編輯'):'檢視'}</button>
            {isEditMode && <>
               <button onClick={()=>openAddModal(null)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 shadow-sm active:scale-95"><PlusCircle size={14}/> 新增</button>
               {isSuperAdmin && <button onClick={()=>setShowLogModal(true)} className="bg-purple-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><History size={14}/> 紀錄</button>}
               
               {!isBatchEditMode && <button onClick={toggleBatchEditMode} className="bg-blue-50 text-blue-600 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Pencil size={14}/> 批次修改</button>}
               {isBatchEditMode && <button onClick={()=>setShowConfirmBatchSave(true)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Save size={14}/> 儲存</button>}
               <div className="relative"><input type="file" multiple accept="image/*" onChange={handleBatchImageUpload} className="absolute inset-0 opacity-0 cursor-pointer"/><button className="text-pink-600 bg-pink-50 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 pointer-events-none"><ImageIcon size={14}/> 批次圖片</button></div>
               <button onClick={toggleDeleteMode} className={`p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 ${isDeleteMode?'bg-red-600 text-white':'bg-red-50 text-red-600'}`}><Trash size={14}/> {isDeleteMode?'取消':'刪除'}</button>
            </>}
            <button onClick={()=>exportToCSV(displayItems, '庫存')} className="text-slate-500 flex gap-1 text-xs hover:text-indigo-600"><Download size={16}/> 匯出</button>
          </div>
        </div>
        <div className="relative"><input type="text" value={globalSearch} onChange={handleGlobalSearchChange} placeholder="輸入料號或品名搜尋..." className="w-full p-3 pl-10 bg-white border border-slate-200 rounded-xl shadow-sm outline-none"/><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/></div>
      </div>

      {!currentFolder && !globalSearch ? (
         <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {folders.map(f => (
               <button key={f} onClick={()=>setCurrentFolder(f)} className="bg-white p-4 rounded-xl shadow-sm border flex flex-col items-center hover:bg-indigo-50 transition-colors">
                  <FolderOpen size={32} className="text-blue-400 mb-2"/>
                  <span className="font-bold text-lg text-slate-700">{f}</span>
                  {/* 數量計算邏輯 */}
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 mt-1">
                     {inventory.filter(i => {
                        const key = (i.partNumber?.[0] || i.name?.[0] || '?').toUpperCase();
                        return key === f;
                     }).length} 項目
                  </span>
               </button>
            ))}
         </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
           {(isDeleteMode || isBatchEditMode) && <div className={`absolute top-0 left-0 right-0 p-2 z-10 flex justify-between ${isDeleteMode?'bg-red-50 text-red-700':'bg-blue-50 text-blue-700'}`}><span className="text-sm font-bold ml-2">{isDeleteMode?`選取 ${selectedIds.size} 筆`:'批次修改模式'}</span><button onClick={isDeleteMode?toggleDeleteMode:toggleBatchEditMode} className="bg-white px-3 py-1 rounded shadow-sm text-xs">取消</button>{isDeleteMode && <button onClick={()=>setShowConfirmDelete(true)} disabled={!selectedIds.size} className="bg-red-600 text-white px-3 py-1 rounded text-xs shadow-sm ml-2">刪除</button>}</div>}
           <div className={`p-3 border-b flex justify-between ${isEditMode?'bg-orange-50':'bg-blue-50'} ${(isDeleteMode||isBatchEditMode)?'mt-10':''}`}><h3 className="font-bold flex gap-2"><FolderOpen size={16}/> {globalSearch ? '搜尋結果' : `${currentFolder} 類別清單`}</h3><span className="text-xs">共 {displayItems.length} 筆</span></div>
           <div className="overflow-auto max-h-[75vh]">
             <table className="w-full text-left text-xs sm:text-sm">
               <thead className="bg-slate-50 font-semibold border-b sticky top-0 z-10 shadow-sm">
                 <tr>
                   {isDeleteMode && <th className="p-2 w-10 text-center bg-slate-50"><button onClick={handleSelectAll}><CheckSquare size={16}/></button></th>}
                   {['序號','圖','料號','品名','尺寸','分類','材質(規格)','顏色','備註','庫存'].map(h=><th key={h} className="p-2 whitespace-nowrap bg-slate-50">{h}</th>)}
                   {isEditMode && !isDeleteMode && !isBatchEditMode && <th className="p-2 text-center bg-slate-50">操作</th>}
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
                            <td className="p-2">
                                <input 
                                  list={`cat-list-${item.id}`} 
                                  value={d.category} 
                                  onChange={e=>handleBatchChange(item.id,'category',e.target.value)} 
                                  className="border rounded w-full"
                                />
                                <datalist id={`cat-list-${item.id}`}>
                                  {folderCategories.map(c=><option key={c} value={c}/>)}
                                </datalist>
                            </td>
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
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">尺寸 (選填)</label><input value={formData.size} onChange={e=>setFormData({...formData, size:e.target.value})} className="w-full p-2 border rounded" placeholder="可空白"/></div>
               <div className="w-24"><label className="text-xs font-bold text-slate-400">單位</label><select value={formData.sizeUnit} onChange={e=>setFormData({...formData, sizeUnit:e.target.value})} className="w-full p-2 border rounded"><option>英吋</option><option>mm</option></select></div>
             </div>
             <div className="flex gap-2">
               <div className="flex-1">
                 <label className="text-xs font-bold text-slate-400">分類</label>
                 {/* Input + Datalist for adding custom category */}
                 <input 
                   list="modal-cat-list" 
                   value={formData.category} 
                   onChange={e=>setFormData({...formData, category:e.target.value})} 
                   className="w-full p-2 border rounded"
                 />
                 <datalist id="modal-cat-list">
                    {folderCategories.map(c => <option key={c} value={c} />)}
                 </datalist>
               </div>
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">材質</label><input value={formData.material} onChange={e=>setFormData({...formData, material:e.target.value})} className="w-full p-2 border rounded" required/></div>
             </div>
             <div><label className="text-xs font-bold text-slate-400">材質規格 (可空白)</label><input value={formData.spec} onChange={e=>setFormData({...formData, spec:e.target.value})} className="w-full p-2 border rounded"/></div>
             <div><label className="text-xs font-bold text-slate-400">顏色</label><div className="flex gap-2 mt-1"><label className="flex items-center"><input type="radio" checked={colorMode==='black'} onChange={()=>{setColorMode('black');setFormData(p=>({...p,color:'黑色'}))}} className="mr-1"/>黑色</label><label className="flex items-center"><input type="radio" checked={colorMode==='custom'} onChange={()=>setColorMode('custom')} className="mr-1"/>其他</label></div>{colorMode==='custom' && <input value={customColor} onChange={e=>{setCustomColor(e.target.value);setFormData(p=>({...p,color:e.target.value}))}} className="w-full p-2 border rounded mt-2" placeholder="輸入顏色"/>}</div>
             <div><label className="text-xs font-bold text-slate-400">備註 (選填)</label><input value={formData.remarks} onChange={e=>setFormData({...formData, remarks:e.target.value})} className="w-full p-2 border rounded"/></div>
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
