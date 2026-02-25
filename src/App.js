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
  limit,
  getDoc
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
  History,
  Settings,
  Plus,
  Minus,
  ArrowUpDown, 
  ArrowUp,     
  ArrowDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// ==========================================
// 【發布設定區】
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
const DEFAULT_CATEGORIES = ['零件', '成品'];

// --- 工具函式：簡化 Email 顯示 ---
const formatUserName = (email) => {
  if (!email) return 'Guest';
  return email.split('@')[0];
};

// --- 工具函式：日期格式化 (MM/DD HH:mm) ---
const formatTime = (isoString) => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// --- 工具函式：取得分類顏色 (自動配色) ---
const getCategoryColor = (category) => {
  if (!category) return 'bg-slate-50 text-slate-600 border-slate-200';
  
  const predefined = {
    '成品': 'bg-blue-50 text-blue-600 border-blue-100',
    '零件': 'bg-orange-50 text-orange-600 border-orange-100',
    '鉤頭': 'bg-purple-50 text-purple-600 border-purple-100',
    '鉤座': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    '套片': 'bg-rose-50 text-rose-600 border-rose-100',
  };

  if (predefined[category]) return predefined[category];

  const palettes = [
    'bg-cyan-50 text-cyan-600 border-cyan-100',
    'bg-amber-50 text-amber-600 border-amber-100',
    'bg-indigo-50 text-indigo-600 border-indigo-100',
    'bg-pink-50 text-pink-600 border-pink-100',
    'bg-teal-50 text-teal-600 border-teal-100',
    'bg-lime-50 text-lime-600 border-lime-100',
    'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100',
    'bg-violet-50 text-violet-600 border-violet-100',
  ];
  
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return palettes[Math.abs(hash) % palettes.length];
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

  const oldPhotos = oldItem.photos || (oldItem.photo ? [oldItem.photo] : []);
  const newPhotos = newItem.photos || [];
  if (JSON.stringify(oldPhotos) !== JSON.stringify(newPhotos)) {
     changes.push(`照片: ${oldPhotos.length}張 -> ${newPhotos.length}張`);
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

// --- 工具函式：全域排序邏輯 (加入 numeric: true 支持自然排序) ---
const sortInventoryItems = (a, b) => {
  // 1. 品名 (Name)
  const nameA = a.name || '';
  const nameB = b.name || '';
  const nameCompare = nameA.localeCompare(nameB, "zh-Hant", { numeric: true });
  if (nameCompare !== 0) return nameCompare;
  
  // 2. 尺寸 (Size)
  const sizeA = getSizeValue(a.size);
  const sizeB = getSizeValue(b.size);

  if (sizeA.type !== sizeB.type) {
    return sizeA.type - sizeB.type; 
  }
  if (sizeA.type === 0 || sizeA.type === 1) {
    const diff = sizeA.val - sizeB.val; 
    if (diff !== 0) return diff;
  }
  if (sizeA.type === 2) {
    const diff = sizeA.val.localeCompare(sizeB.val, "zh-Hant", { numeric: true });
    if (diff !== 0) return diff;
  }

  // 3. 材質 (Material + Spec)
  const matA = (a.material || '') + ' ' + (a.spec || '');
  const matB = (b.material || '') + ' ' + (b.spec || '');
  const matCompare = matA.localeCompare(matB, "zh-Hant", { numeric: true });
  if (matCompare !== 0) return matCompare;

  // 4. 顏色 (Color)
  const colorA = a.color || '';
  const colorB = b.color || '';
  const colorCompare = colorA.localeCompare(colorB, "zh-Hant", { numeric: true });
  if (colorCompare !== 0) return colorCompare;

  // 5. 料號 (Part Number) - 最後比對
  const partA = a.partNumber || '';
  const partB = b.partNumber || '';
  return partA.localeCompare(partB, "zh-Hant", { numeric: true });
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

// --- 分類管理視窗 (Category Manager) - 資料夾專屬 ---
function CategoryManagerModal({ categories, folder, onClose }) {
  const [newCat, setNewCat] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    if (categories.includes(newCat.trim())) {
      alert('分類已存在');
      return;
    }
    setIsProcessing(true);
    try {
      const newList = [...categories, newCat.trim()];
      // 寫入到特定資料夾的設定檔 (e.g., settings/categories_A)
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${folder}`), { list: newList });
      setNewCat('');
    } catch (err) {
      console.error(err);
      alert('新增失敗');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (catToDelete) => {
    if (catToDelete === '零件' || catToDelete === '成品') {
      alert('預設分類不可刪除');
      return;
    }
    if (!confirm(`確定要刪除「${catToDelete}」分類嗎？`)) return;
    setIsProcessing(true);
    try {
      const newList = categories.filter(c => c !== catToDelete);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${folder}`), { list: newList });
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50">
           <h3 className="font-bold text-indigo-900 flex items-center gap-2">
             <Settings size={20}/> 分類管理 ({folder})
           </h3>
           <button onClick={onClose} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-600 transition-colors"><X size={20}/></button>
        </div>
        <div className="p-4">
          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
            <input 
              type="text" 
              value={newCat} 
              onChange={e => setNewCat(e.target.value)} 
              placeholder="輸入新分類名稱" 
              className="flex-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button disabled={isProcessing} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Plus size={20}/></button>
          </form>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {categories.map((cat, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className={`font-medium px-2 py-0.5 rounded text-xs border ${getCategoryColor(cat)}`}>{cat}</span>
                {cat !== '零件' && cat !== '成品' && (
                  <button onClick={() => handleDelete(cat)} disabled={isProcessing} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><Minus size={16}/></button>
                )}
              </div>
            ))}
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

// --- 大圖預覽組件 (支援多圖輪播) ---
function ImagePreviewModal({ images, onClose }) {
  const [idx, setIdx] = useState(0);
  
  const imageList = useMemo(() => {
     if (!images) return [];
     return Array.isArray(images) ? images : [images];
  }, [images]);

  if (imageList.length === 0) return null;

  const currentSrc = imageList[idx];

  return (
    <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in" onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
      <button className="absolute top-4 right-4 bg-white/20 text-white rounded-full p-2 hover:bg-white/40 transition-colors z-50" onClick={onClose}>
        <X size={24} />
      </button>
      
      <div className="flex-1 flex items-center justify-center w-full min-h-0 relative">
         {imageList.length > 1 && (
           <button 
             className="absolute left-0 p-2 text-white bg-black/20 hover:bg-black/40 rounded-r h-full flex items-center"
             onClick={(e) => { e.stopPropagation(); setIdx((prev) => (prev - 1 + imageList.length) % imageList.length); }}
           >
             <ChevronLeft size={48} />
           </button>
         )}
         
         <img 
           src={currentSrc} 
           alt={`Preview ${idx + 1}`} 
           className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
         />

         {imageList.length > 1 && (
           <button 
             className="absolute right-0 p-2 text-white bg-black/20 hover:bg-black/40 rounded-l h-full flex items-center"
             onClick={(e) => { e.stopPropagation(); setIdx((prev) => (prev + 1) % imageList.length); }}
           >
             <ChevronRight size={48} />
           </button>
         )}
      </div>

      {imageList.length > 1 && (
        <div className="h-20 w-full mt-4 flex gap-2 overflow-x-auto justify-center px-4" onClick={(e) => e.stopPropagation()}>
           {imageList.map((img, i) => (
             <button 
               key={i} 
               onClick={() => setIdx(i)}
               className={`h-full aspect-square rounded-md overflow-hidden border-2 flex-shrink-0 transition-all ${i === idx ? 'border-indigo-500 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
             >
               <img src={img} className="w-full h-full object-cover" />
             </button>
           ))}
        </div>
      )}
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
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES); 
  const [onlineUsers, setOnlineUsers] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // 0. 自動載入 Tailwind CSS
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

  // 1. 初始化身份驗證
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

    // B. 監聽分類
    const catRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'categories');
    const unsubCat = onSnapshot(catRef, (docSnap) => {
       if (docSnap.exists()) {
         setCategories(docSnap.data().list || ['零件', '成品']);
       } else {
         setDoc(catRef, { list: ['零件', '成品'] }); // 初始化
       }
    });

    // C. 線上狀態
    const presenceRef = doc(db, 'artifacts', appId, 'public', 'data', 'presence', user.uid);
    const updatePresence = () => setDoc(presenceRef, { email: user.email, lastSeen: new Date().toISOString() }, { merge: true });
    updatePresence();
    const interval = setInterval(updatePresence, 60000); 

    // D. 監聽其他使用者
    const presenceColl = collection(db, 'artifacts', appId, 'public', 'data', 'presence');
    const unsubPresence = onSnapshot(presenceColl, (snapshot) => {
      const now = new Date();
      setOnlineUsers(snapshot.docs.map(d => ({id: d.id, ...d.data()})).filter(u => (now - new Date(u.lastSeen)) < 120000 && u.id !== user.uid));
    });

    return () => {
      unsubInv(); unsubCat(); clearInterval(interval); unsubPresence();
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
             {/* 顯示其他線上使用者 */}
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

      {/* Main Content - 傳遞 categories */}
      <main className="max-w-7xl mx-auto p-4 w-full">
        {activeTab === 'inbound' && <TransactionForm mode="inbound" inventory={inventory} categories={categories} onSave={showMsg} currentUser={user} />}
        {activeTab === 'outbound' && <TransactionForm mode="outbound" inventory={inventory} categories={categories} onSave={showMsg} currentUser={user} />}
        {activeTab === 'search' && <InventorySearch inventory={inventory} onSave={showMsg} isDemoEnv={isDemoEnv} currentUser={user} />}
      </main>

      {/* Footer Version */}
      <div className="fixed bottom-28 right-4 z-10 pointer-events-none text-[10px] text-slate-400 opacity-60 font-mono">
        v260126
      </div>

      {/* Tab Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-6 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
        <div className="flex justify-around w-full max-w-7xl mx-auto">
          <NavButton active={activeTab === 'inbound'} onClick={() => setActiveTab('inbound')} icon={<PlusCircle size={24}/>} label="入庫" />
          <NavButton active={activeTab === 'outbound'} onClick={() => setActiveTab('outbound')} icon={<MinusCircle size={24}/>} label="出庫" />
          <NavButton active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={24}/>} label="庫存查詢" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-full h-16 justify-center ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span className="text-sm font-bold mt-1">{label}</span>
    </button>
  );
}

// --- 入庫與出庫共用表單 ---
function TransactionForm({ mode, inventory, categories, onSave, currentUser }) {
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
      // 入庫/出庫時，分類建議使用所有已知的分類 (或該產品的分類)
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
           
           {/* 顯示對應的品名 (唯讀) */}
           <div className="text-center mb-2">
             <span className="text-xs text-slate-400">對應品名</span>
             <p className="text-lg font-bold text-slate-700">{matchingVariants[0].name}</p>
           </div>

           {/* 顯示產品照片 */}
           {targetItem && (targetItem.photo || (targetItem.photos && targetItem.photos.length > 0)) && (
             <div className="flex justify-center mb-4 bg-gray-50 p-2 rounded-lg border border-slate-200">
               <div className="w-32 h-32 relative bg-white rounded-md border border-slate-200 overflow-hidden">
                 <img 
                   src={targetItem.photo || targetItem.photos[0]} 
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
                  {/* 只顯示該產品實際擁有的分類 */}
                  {options.categories.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
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
  const [previewImages, setPreviewImages] = useState(null); // Updated: support multiple images
  const [isEditMode, setIsEditMode] = useState(false); 
  const [showPwdModal, setShowPwdModal] = useState(false); 
  const [showLogModal, setShowLogModal] = useState(false); 
  const [showCatManager, setShowCatManager] = useState(false); 
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); 
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES); // 本地分類狀態

  // 排序設定 (預設無)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // 監聽並同步目前資料夾的分類設定 (區域性)
  useEffect(() => {
    const defaultCats = DEFAULT_CATEGORIES;
    
    if (!currentFolder) {
      setCategories(defaultCats);
      return;
    }
    
    // 讀取該資料夾專屬的分類設定
    const catRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${currentFolder}`);
    const unsubscribe = onSnapshot(catRef, (snap) => {
      if (snap.exists()) {
        const customList = snap.data().list || [];
        // 合併預設分類與自定義分類，並移除重複
        setCategories(Array.from(new Set([...defaultCats, ...customList])));
      } else {
        setCategories(defaultCats);
      }
    });
    return () => unsubscribe();
  }, [currentFolder]);
  
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
  
  // Form states
  const [formPartNumber, setFormPartNumber] = useState('');
  const [formName, setFormName] = useState('');
  const [formSizeVal, setFormSizeVal] = useState('');
  const [formSizeUnit, setFormSizeUnit] = useState('英吋'); 
  const [formCategory, setFormCategory] = useState(''); 
  const [formMaterial, setFormMaterial] = useState('');
  const [formSpec, setFormSpec] = useState(''); 
  const [formQty, setFormQty] = useState('0');
  const [formSafetyStock, setFormSafetyStock] = useState('5000'); 
  // formPhotos: Array of strings. First one is cover.
  const [formPhotos, setFormPhotos] = useState([]); 
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
    let list = inventory;
    if (globalSearch.trim()) {
      // 搜尋料號 或 品名
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

    // 排序邏輯
    if (sortConfig.key) {
       list = [...list].sort((a, b) => {
         let res = 0;
         const { key, direction } = sortConfig;
         const dir = direction === 'asc' ? 1 : -1;

         if (key === 'size') {
            const sA = getSizeValue(a.size);
            const sB = getSizeValue(b.size);
            if (sA.type !== sB.type) res = sA.type - sB.type;
            else if (sA.type === 0 || sA.type === 1) res = sA.val - sB.val;
            else res = sA.val.localeCompare(sB.val, "zh-Hant", { numeric: true });
         } else if (key === 'material') {
            // 材質 + 規格 排序
            res = (a.material || '').localeCompare(b.material || '', "zh-Hant", { numeric: true });
            if (res === 0) res = (a.spec || '').localeCompare(b.spec || '', "zh-Hant", { numeric: true });
         } else if (key === 'lastUpdated') {
             const timeA = new Date(a.lastUpdated || 0).getTime();
             const timeB = new Date(b.lastUpdated || 0).getTime();
             res = timeA - timeB;
         } else {
            const valA = (a[key] || '').toString();
            const valB = (b[key] || '').toString();
            res = valA.localeCompare(valB, "zh-Hant", { numeric: true });
         }
         return res * dir;
       });
    } else {
       // 預設排序
       list.sort(sortInventoryItems);
    }
    return list;
  }, [currentFolder, inventory, globalSearch, sortConfig]);

  const handleSort = (key) => {
    // 尺寸已移除點擊排序
    if (key === 'size') return;
    
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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
      setIsSuperAdmin(false);
    } else {
      setShowPwdModal(true); // 開啟需要驗證
    }
  };

  const handlePasswordSuccess = (superAdmin) => {
    setIsEditMode(true);
    setIsSuperAdmin(superAdmin);
  };

  // --- 批量刪除邏輯 ---
  const toggleDeleteMode = () => { setIsDeleteMode(!isDeleteMode); setIsBatchEditMode(false); setSelectedIds(new Set()); };
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
      onSave('success', `成功刪除 ${count} 筆資料`);
      setSelectedIds(new Set());
      setIsDeleteMode(false);
      setShowConfirmDelete(false);
    } catch (err) { onSave('error', '失敗'); }
  };

  // --- 批量修改邏輯 ---
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

  // --- CSV Import (自動同步分類版 - 修正) ---
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(`匯入 ${file.name}?`)) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = event.target.result.split('\n');
      const batch = writeBatch(db);
      let count = 0;
      
      // 用來暫存各資料夾的新分類
      const newCatsMap = {};

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].trim().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        if (cols.length >= 8) {
           const partNumber = cols[0];
           const name = cols[1];
           const category = cols[3] || '零件';

           // 1. 判斷資料夾 (首字)
           const folderKey = (partNumber?.[0] || name?.[0] || '?').toUpperCase();
           
           // 2. 收集分類 (排除預設) - 只有當匯入資料真的有新分類時才記錄
           if (category !== '零件' && category !== '成品') {
              if (!newCatsMap[folderKey]) newCatsMap[folderKey] = new Set();
              newCatsMap[folderKey].add(category);
           }

           const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
           // 匯入時，photo 為單一字串。新架構相容：photo 欄位仍保留為首圖，但之後邏輯主要看 photos。
           // 這裡暫時維持 photo 單一欄位，開啟編輯時會自動轉為 photos array
           const newItem = {
             partNumber: partNumber, name: name, size: cols[2], category: category, material: cols[4], spec: cols[5],
             color: cols[6], remarks: cols[7], quantity: parseInt(cols[8])||0, safetyStock: parseInt(cols[9])||5000, 
             photo: cols[10]||'', photos: cols[10] ? [cols[10]] : [],
             lastUpdated: new Date().toISOString(), lastEditor: currentUser.email
           };
           batch.set(ref, newItem);
           count++;
        }
      }
      if (count > 0) { 
        try { 
            await batch.commit(); 
            
            // 3. 批次更新各資料夾的分類設定 (只更新有新分類的資料夾)
            for (const [folder, catsSet] of Object.entries(newCatsMap)) {
               const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${folder}`);
               try {
                 const snap = await getDoc(settingsRef);
                 let currentList = DEFAULT_CATEGORIES;
                 if (snap.exists()) {
                    currentList = snap.data().list || DEFAULT_CATEGORIES;
                 }
                 const mergedList = Array.from(new Set([...currentList, ...catsSet]));
                 // 只有當真的有新分類加入時才寫入資料庫
                 if (mergedList.length > currentList.length) {
                    await setDoc(settingsRef, { list: mergedList }, { merge: true });
                 }
               } catch (err) {
                 console.error(`Error updating categories for folder ${folder}:`, err);
               }
            }

            await addAuditLog('匯入', 'CSV', `新增 ${count} 筆`, currentUser.email); 
            onSave('success', `匯入 ${count} 筆，分類已同步`); 
        } catch(e) { 
            console.error(e);
            onSave('error', '匯入失敗'); 
        }
      }
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
               // 批次匯入圖片時，更新 photo 和 photos
               const updates = ids.map(id => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { 
                 photo: url, 
                 photos: [url], 
                 lastUpdated: new Date().toISOString(), 
                 lastEditor: currentUser.email 
               }));
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
      // 使用分類清單的第一個作為預設值，若無則預設零件
      setFormCategory(item.category||(categories.length > 0 ? categories[0] : '零件')); 
      setFormMaterial(item.material||''); setFormSpec(item.spec||'');
      setFormQty(item.quantity); setFormSafetyStock(item.safetyStock||5000); 
      // Initialize photos array
      const itemPhotos = item.photos && item.photos.length > 0 ? item.photos : (item.photo ? [item.photo] : []);
      setFormPhotos(itemPhotos); 
      setFormRemarks(item.remarks||'');
      if (item.color === '黑色') { setColorMode('black'); setCustomColorVal(''); } else { setColorMode('custom'); setCustomColorVal(item.color||''); }
    } else {
      setEditingItem(null); setFormPartNumber(''); setFormName(''); setFormSizeVal(''); setFormSizeUnit('英吋');
      setFormCategory(categories.length > 0 ? categories[0] : '零件'); setFormMaterial(''); setFormSpec(''); setFormQty('0'); setFormSafetyStock(5000);
      setFormPhotos([]); setFormRemarks(''); setColorMode('black'); setCustomColorVal('');
    }
    setIsAdding(true);
  };

  const handleFormSave = async (e) => {
    e.preventDefault();
    if (isDemoEnv && manualConfig.apiKey.includes("請填入")) return onSave('error', '請設定 Firebase');
    try {
      const fullSize = formSizeVal.trim() !== '' ? (formSizeVal.match(/mm|英吋/) ? formSizeVal : `${formSizeVal}${formSizeUnit}`) : '';
      const finalColor = colorMode === 'black' ? '黑色' : customColorVal;
      
      const categoryToSave = formCategory.trim(); 

      const data = {
        partNumber: formPartNumber.trim(), name: formName.trim(), size: fullSize, category: categoryToSave,
        material: formMaterial, spec: formSpec, color: finalColor, remarks: formRemarks,
        quantity: parseInt(formQty)||0, safetyStock: parseInt(formSafetyStock)||5000, 
        photo: formPhotos.length > 0 ? formPhotos[0] : '', // Main thumbnail is first photo
        photos: formPhotos, // Save all photos
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

      // --- 自動更新分類設定 (如果是新分類且目前有選定資料夾) ---
      if (currentFolder && !categories.includes(categoryToSave)) {
         const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${currentFolder}`);
         const newList = [...categories, categoryToSave];
         setDoc(settingsRef, { list: newList }, { merge: true }).catch(console.error);
      }

      setIsAdding(false);
    } catch (err) { onSave('error', '失敗'); }
  };

  // --- Photo Actions for Modal ---
  const handleAddPhoto = (e) => {
     const files = Array.from(e.target.files);
     if(!files.length) return;
     
     // Process each file
     files.forEach(f => {
       const r = new FileReader();
       r.onload = (ev) => {
          const i = new Image();
          i.onload = () => {
             const c = document.createElement('canvas'); const ctx = c.getContext('2d');
             const M = 500; let w=i.width, h=i.height;
             if(w>h){if(w>M){h*=M/w;w=M}}else{if(h>M){w*=M/h;h=M}}
             c.width=w; c.height=h; ctx.drawImage(i,0,0,w,h);
             const url = c.toDataURL('image/jpeg', 0.5);
             setFormPhotos(prev => [...prev, url]);
          };
          i.src = ev.target.result;
       };
       r.readAsDataURL(f);
     });
     e.target.value = null; // Reset input
  };

  const handleRemovePhoto = (index) => {
    setFormPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleMovePhoto = (index, direction) => {
    // direction: -1 (left/up), 1 (right/down)
    if ((index === 0 && direction === -1) || (index === formPhotos.length - 1 && direction === 1)) return;
    
    setFormPhotos(prev => {
      const newPhotos = [...prev];
      const temp = newPhotos[index];
      newPhotos[index] = newPhotos[index + direction];
      newPhotos[index + direction] = temp;
      return newPhotos;
    });
  };

  // Sort helper for header
  const SortHeader = ({ label, sortKey }) => (
    <th className="p-2 whitespace-nowrap bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => sortKey && handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortKey && (sortConfig.key === sortKey ? (
           sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>
        ) : <ArrowUpDown size={14} className="text-slate-300"/>)}
      </div>
    </th>
  );

  return (
    <div className="animate-in fade-in h-full flex flex-col">
      <ImagePreviewModal images={previewImages} onClose={() => setPreviewImages(null)} />
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} onSuccess={handlePasswordSuccess} />}
      {showLogModal && <AuditLogModal onClose={() => setShowLogModal(false)} />}
      {showCatManager && <CategoryManagerModal categories={categories} folder={currentFolder} onClose={() => setShowCatManager(false)} />}
      
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
               
               {/* 只有在進入特定資料夾時才顯示分類管理 */}
               {currentFolder && !globalSearch && (
                  <button onClick={()=>setShowCatManager(true)} className="bg-gray-100 text-gray-600 p-1.5 px-2 rounded-lg text-xs font-bold hover:bg-gray-200 flex items-center gap-1"><Settings size={14}/>分類管理</button>
               )}

               {!isBatchEditMode && <button onClick={toggleBatchEditMode} className="bg-blue-50 text-blue-600 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Pencil size={14}/> 批次修改</button>}
               {isBatchEditMode && <button onClick={()=>setShowConfirmBatchSave(true)} className="bg-indigo-600 text-white p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Save size={14}/> 儲存</button>}
               <div className="relative"><input type="file" multiple accept="image/*" onChange={handleBatchImageUpload} className="absolute inset-0 opacity-0 cursor-pointer"/><button className="text-pink-600 bg-pink-50 p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 pointer-events-none"><ImageIcon size={14}/> 批次圖片</button></div>
               <button onClick={toggleDeleteMode} className={`p-1.5 px-3 rounded-lg text-xs font-bold flex gap-1 ${isDeleteMode?'bg-red-600 text-white':'bg-red-50 text-red-600'}`}><Trash size={14}/> {isDeleteMode?'取消':'刪除'}</button>
            </>}
            <button onClick={()=>exportToCSV(displayItems, '庫存')} className="text-slate-500 flex gap-1 text-xs hover:text-indigo-600"><Download size={16}/> 匯出</button>
          </div>
        </div>
        <div className="relative"><input type="text" value={globalSearch} onChange={handleGlobalSearchChange} placeholder="搜尋料號或品名..." className="w-full p-3 pl-10 bg-white border border-slate-200 rounded-xl shadow-sm outline-none"/><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/></div>
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
                   {isDeleteMode && <th className="p-2 w-10 text-center"><button onClick={handleSelectAll}><CheckSquare size={16}/></button></th>}
                   {['序號','圖'].map(h=><th key={h} className={`p-2 bg-slate-50 ${h==='圖'?'w-14':''}`}>{h}</th>)}
                   {['料號','品名'].map(h=><SortHeader key={h} label={h} sortKey={h==='料號'?'partNumber':'name'} />)}
                   <th className="p-2 whitespace-nowrap bg-slate-50">尺寸</th> 
                   <SortHeader label="分類" sortKey="category" />
                   <SortHeader label="材質(規格)" sortKey="material" />
                   <SortHeader label="顏色" sortKey="color" />
                   <th className="p-2 whitespace-nowrap bg-slate-50">備註</th>
                   <th className="p-2 whitespace-nowrap text-right bg-slate-50">庫存</th>
                   {isEditMode && <SortHeader label="更新時間" sortKey="lastUpdated" />}
                   {isEditMode && !isDeleteMode && !isBatchEditMode && <th className="p-2 text-center bg-slate-50">操作</th>}
                 </tr>
               </thead>
               <tbody className="divide-y">
                 {displayItems.map((item, idx) => {
                   const isLow = item.quantity < (item.safetyStock||5000);
                   const d = isBatchEditMode ? (batchEditValues[item.id] || item) : item;
                   
                   // Display thumbnail
                   const thumb = (item.photos && item.photos.length > 0) ? item.photos[0] : item.photo;
                   
                   // Prepare all images for preview
                   const allImages = (item.photos && item.photos.length > 0) ? item.photos : (item.photo ? [item.photo] : []);

                   return (
                     <tr key={item.id} className={`hover:bg-slate-50 ${selectedIds.has(item.id)?'bg-red-50':''}`}>
                       {isDeleteMode && <td className="p-2 text-center"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={()=>handleSelect(item.id)} className="w-4 h-4"/></td>}
                       <td className="p-2 text-center text-slate-400">{idx+1}</td>
                       <td className="p-2"><div className="w-10 h-10 bg-white border rounded flex items-center justify-center cursor-pointer" onClick={()=>!isBatchEditMode&&setPreviewImages(allImages)}>{thumb?<img src={thumb} className="w-full h-full object-contain"/>:<ImageIcon size={16} className="text-slate-300"/>}</div></td>
                       {isBatchEditMode ? (
                          <>
                            <td className="p-2"><input value={d.partNumber} onChange={e=>handleBatchChange(item.id,'partNumber',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input value={d.name} onChange={e=>handleBatchChange(item.id,'name',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><input value={d.size} onChange={e=>handleBatchChange(item.id,'size',e.target.value)} className="border rounded w-full"/></td>
                            <td className="p-2"><select value={d.category} onChange={e=>handleBatchChange(item.id,'category',e.target.value)} className="border rounded w-full">{categories.map(c=><option key={c}>{c}</option>)}</select></td>
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
                            <td className="p-2">
                               <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryColor(item.category)}`}>{item.category}</span>
                            </td>
                            <td className="p-2">{item.material||'-'} <span className="text-slate-400 text-xs">{item.spec}</span></td>
                            <td className="p-2">{item.color||'-'}</td>
                            <td className="p-2 text-xs">{item.remarks||'-'}</td>
                            <td className={`p-2 text-right font-bold ${isLow?'text-red-600':'text-blue-600'}`}>{item.quantity}</td>
                          </>
                       )}
                       {isEditMode && <td className="p-2 text-xs text-slate-400 whitespace-nowrap">{formatTime(item.lastUpdated)}</td>}
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
             <div><label className="text-xs font-bold text-slate-400">料號 (必填)</label><input value={formPartNumber} onChange={e=>setFormPartNumber(e.target.value)} className="w-full p-2 border rounded" required/></div>
             <div><label className="text-xs font-bold text-slate-400">品名</label><input value={formName} onChange={e=>setFormName(e.target.value)} className="w-full p-2 border rounded" required/></div>
             
             {/* Photo Gallery Manager */}
             <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">產品照片 (第一張為封面)</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                   {formPhotos.map((p, i) => (
                      <div key={i} className="relative group aspect-square border rounded-lg overflow-hidden bg-slate-100">
                         <img src={p} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                            <div className="flex justify-end"><button type="button" onClick={()=>handleRemovePhoto(i)} className="bg-red-500 text-white p-1 rounded-full"><Trash size={12}/></button></div>
                            <div className="flex justify-between">
                               {i > 0 && <button type="button" onClick={()=>handleMovePhoto(i, -1)} className="bg-white/80 p-1 rounded hover:bg-white"><ChevronLeft size={14}/></button>}
                               {i < formPhotos.length-1 && <button type="button" onClick={()=>handleMovePhoto(i, 1)} className="bg-white/80 p-1 rounded hover:bg-white"><ChevronRight size={14}/></button>}
                            </div>
                         </div>
                         {i === 0 && <div className="absolute top-0 left-0 bg-yellow-400 text-[9px] font-bold px-1.5 py-0.5 rounded-br">封面</div>}
                      </div>
                   ))}
                   <label className="border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-500 transition-colors aspect-square">
                      <Plus size={24}/>
                      <span className="text-[10px]">新增</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleAddPhoto} />
                   </label>
                </div>
             </div>

             <div className="flex gap-2">
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">尺寸 (選填)</label><input value={formSizeVal} onChange={e=>setFormSizeVal(e.target.value)} className="w-full p-2 border rounded" placeholder="可空白"/></div>
               <div className="w-24"><label className="text-xs font-bold text-slate-400">單位</label><select value={formSizeUnit} onChange={e=>setFormSizeUnit(e.target.value)} className="w-full p-2 border rounded"><option>英吋</option><option>mm</option></select></div>
             </div>
             <div className="flex gap-2">
               <div className="flex-1">
                 <label className="text-xs font-bold text-slate-400">分類</label>
                 <select 
                   value={formCategory} 
                   onChange={e=>setFormCategory(e.target.value)} 
                   className="w-full p-2 border rounded"
                 >
                   {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>
               <div className="flex-1"><label className="text-xs font-bold text-slate-400">材質</label><input value={formMaterial} onChange={e=>setFormMaterial(e.target.value)} className="w-full p-2 border rounded" required/></div>
             </div>
             <div><label className="text-xs font-bold text-slate-400">材質規格 (可空白)</label><input value={formSpec} onChange={e=>setFormSpec(e.target.value)} className="w-full p-2 border rounded"/></div>
             <div><label className="text-xs font-bold text-slate-400">顏色</label><div className="flex gap-2 mt-1"><label className="flex items-center"><input type="radio" checked={colorMode==='black'} onChange={()=>{setColorMode('black');setCustomColorVal('')}} className="mr-1"/>黑色</label><label className="flex items-center"><input type="radio" checked={colorMode==='custom'} onChange={()=>setColorMode('custom')} className="mr-1"/>其他</label></div>{colorMode==='custom' && <input value={customColorVal} onChange={e=>{setCustomColorVal(e.target.value)}} className="w-full p-2 border rounded mt-2" placeholder="輸入顏色"/>}</div>
             <div><label className="text-xs font-bold text-slate-400">備註 (選填)</label><input value={formRemarks} onChange={e=>setFormRemarks(e.target.value)} className="w-full p-2 border rounded"/></div>
             <div className="flex gap-2">
               <div><label className="text-xs font-bold text-slate-400">庫存</label><input type="number" value={formQty} onChange={e=>setFormQty(e.target.value)} className="w-full p-2 border rounded" required/></div>
               <div><label className="text-xs font-bold text-slate-400">安全庫存</label><input type="number" value={formSafetyStock} onChange={e=>setFormSafetyStock(e.target.value)} className="w-full p-2 border rounded"/></div>
             </div>
             <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-2">儲存</button>
          </form>
        </div>
      )}
    </div>
  );
}
