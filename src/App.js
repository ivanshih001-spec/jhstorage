import React, { useState, useEffect, useMemo } from 'react';
import InventorySearchExperience from './InventorySearchExperience';
import './AppShellV2.css';
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
// ã€ç™¼å¸ƒè¨­å®šå€ã€‘
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

// --- Firebase åˆå§‹åŒ–é‚è¼¯ ---
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

// --- å®‰å…¨æ€§è¨­å®šï¼šå¯†ç¢¼ç·¨ç¢¼ ---
const ADMIN_PWD_HASH = "ODM1NQ=="; // 8355
const SUPER_ADMIN_PWD_HASH = "MDYwNQ=="; // 0605
const DEFAULT_CATEGORIES = ['é›¶ä»¶', 'æˆå“'];

// --- å·¥å…·å‡½å¼ï¼šç°¡åŒ– Email é¡¯ç¤º ---
const formatUserName = (email) => {
  if (!email) return 'Guest';
  return email.split('@')[0];
};

// --- å·¥å…·å‡½å¼ï¼šæ—¥æœŸæ ¼å¼åŒ– (MM/DD HH:mm) ---
const formatTime = (isoString) => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// --- å·¥å…·å‡½å¼ï¼šå–å¾—åˆ†é¡žé¡è‰² (è‡ªå‹•é…è‰²) ---
const getCategoryColor = (category) => {
  if (!category) return 'bg-slate-50 text-slate-600 border-slate-200';
  
  const predefined = {
    'æˆå“': 'bg-blue-50 text-blue-600 border-blue-100',
    'é›¶ä»¶': 'bg-orange-50 text-orange-600 border-orange-100',
    'é‰¤é ­': 'bg-purple-50 text-purple-600 border-purple-100',
    'é‰¤åº§': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    'å¥—ç‰‡': 'bg-rose-50 text-rose-600 border-rose-100',
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

// --- å·¥å…·å‡½å¼ï¼šæ•¸å€¼æ ¼å¼åŒ– ---
const formatVal = (v) => (v === undefined || v === null) ? '' : String(v);

// --- å·¥å…·å‡½å¼ï¼šç”Ÿæˆç”¢å“è­˜åˆ¥å­—ä¸² ---
const getProductIdentity = (item) => {
  if (!item) return 'æœªçŸ¥ç”¢å“';
  const specStr = item.spec ? `(${item.spec})` : '';
  return `[${item.partNumber}] ${item.name} - ${item.material}${specStr} ${item.color}`;
};

// --- å·¥å…·å‡½å¼ï¼šæ¯”å°ç‰©ä»¶å·®ç•° ---
const getDiff = (oldItem, newItem) => {
  const changes = [];
  const fieldMap = {
    partNumber: 'æ–™è™Ÿ',
    name: 'å“å',
    size: 'å°ºå¯¸',
    category: 'åˆ†é¡ž',
    material: 'æè³ª',
    spec: 'æè³ªè¦æ ¼',
    color: 'é¡è‰²',
    remarks: 'å‚™è¨»',
    quantity: 'åº«å­˜',
    safetyStock: 'å®‰å…¨åº«å­˜'
  };

  Object.keys(fieldMap).forEach(key => {
    const v1 = formatVal(oldItem[key]);
    const v2 = formatVal(newItem[key]);
    if (v1 != v2) {
       changes.push(`${fieldMap[key]}: ${v1 || '(ç©º)'} -> ${v2 || '(ç©º)'}`);
    }
  });

  const oldPhotos = oldItem.photos || (oldItem.photo ? [oldItem.photo] : []);
  const newPhotos = newItem.photos || [];
  if (JSON.stringify(oldPhotos) !== JSON.stringify(newPhotos)) {
     changes.push(`ç…§ç‰‡: ${oldPhotos.length}å¼µ -> ${newPhotos.length}å¼µ`);
  }

  return changes.join('; ');
};

// --- å·¥å…·å‡½å¼ï¼šå¯«å…¥æ“ä½œç´€éŒ„ ---
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

// --- å·¥å…·å‡½å¼ï¼šè§£æžå°ºå¯¸æ•¸å€¼ ---
const getSizeValue = (sizeStr) => {
  if (!sizeStr) return { type: 3, val: 0 }; 
  const s = sizeStr.toString().toLowerCase().trim();

  if (s.endsWith('mm')) {
    const num = parseFloat(s.replace('mm', ''));
    return { type: 0, val: isNaN(num) ? 0 : num };
  }

  let clean = s.replace(/["inchè‹±å‹]/g, '').trim();
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

// --- å·¥å…·å‡½å¼ï¼šå…¨åŸŸæŽ’åºé‚è¼¯ (åŠ å…¥ numeric: true æ”¯æŒè‡ªç„¶æŽ’åº) ---
const sortInventoryItems = (a, b) => {
  // 1. å“å (Name)
  const nameA = a.name || '';
  const nameB = b.name || '';
  const nameCompare = nameA.localeCompare(nameB, "zh-Hant", { numeric: true });
  if (nameCompare !== 0) return nameCompare;
  
  // 2. å°ºå¯¸ (Size)
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

  // 3. æè³ª (Material + Spec)
  const matA = (a.material || '') + ' ' + (a.spec || '');
  const matB = (b.material || '') + ' ' + (b.spec || '');
  const matCompare = matA.localeCompare(matB, "zh-Hant", { numeric: true });
  if (matCompare !== 0) return matCompare;

  // 4. é¡è‰² (Color)
  const colorA = a.color || '';
  const colorB = b.color || '';
  const colorCompare = colorA.localeCompare(colorB, "zh-Hant", { numeric: true });
  if (colorCompare !== 0) return colorCompare;

  // 5. æ–™è™Ÿ (Part Number) - æœ€å¾Œæ¯”å°
  const partA = a.partNumber || '';
  const partB = b.partNumber || '';
  return partA.localeCompare(partB, "zh-Hant", { numeric: true });
};

// --- å·¥å…·å‡½å¼ï¼šåŒ¯å‡º CSV ---
const exportToCSV = (data, fileName = 'inventory_export') => {
  const headers = ["åºè™Ÿ", "æ–™è™Ÿ", "å“å", "å°ºå¯¸", "åˆ†é¡ž", "æè³ª", "æè³ªè¦æ ¼", "é¡è‰²", "å‚™è¨»", "åº«å­˜æ•¸é‡", "å®‰å…¨åº«å­˜", "ç…§ç‰‡", "æœ€å¾Œæ“ä½œè€…", "æœ€å¾Œæ›´æ–°æ™‚é–“"];
  
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
      safe(item.photo ? 'æœ‰åœ–ç‰‡' : ''), 
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

// --- å·¥å…·å‡½å¼ï¼šç”¢ç”ŸåŒ¯å…¥ç¯„æœ¬ ---
const downloadImportTemplate = () => {
  const headers = ["æ–™è™Ÿ", "å“å", "å°ºå¯¸", "åˆ†é¡ž(æˆå“/é›¶ä»¶)", "æè³ª", "æè³ªè¦æ ¼", "é¡è‰²(é»‘è‰²/æœ‰è‰²è«‹å¡«è‰²è™Ÿ)", "å‚™è¨»(å¯ç©ºç™½)", "åº«å­˜æ•¸é‡", "å®‰å…¨åº«å­˜(é è¨­5000)", "ç…§ç‰‡(å¡«å…¥ç¶²å€)"];
  const exampleRow = ["A-001", "ç¯„ä¾‹èžºçµ²A", "5/8\"", "é›¶ä»¶", "ä¸é½é‹¼", "M5x10", "é»‘è‰²", "ç„¡å‚™è¨»", "100", "5000", ""];
  const csvString = "\uFEFF" + headers.join(",") + "\n" + exampleRow.join(",");
  
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "åº«å­˜åŒ¯å…¥ç¯„æœ¬.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- æç¤ºè¦–çª—çµ„ä»¶ (Modal) ---
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
            {type === 'error' ? 'æ“ä½œå¤±æ•—' : 'æ“ä½œæˆåŠŸ'}
          </h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6 font-medium text-base break-words">{text}</p>
          <button 
            onClick={onClose}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-sm tracking-wide ${type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            ç¢ºå®š
          </button>
        </div>
      </div>
    </div>
  );
}

// --- ç¢ºèªè¦–çª— (Confirm Modal) ---
function ConfirmModal({ title, content, onConfirm, onCancel, confirmText = "ç¢ºèª", confirmColor = "bg-red-600" }) {
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
             <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">å–æ¶ˆ</button>
             <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl font-bold text-white ${confirmColor} hover:opacity-90 shadow-lg transition-transform active:scale-95`}>{confirmText}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- åˆ†é¡žç®¡ç†è¦–çª— (Category Manager) - è³‡æ–™å¤¾å°ˆå±¬ ---
function CategoryManagerModal({ categories, folder, onClose }) {
  const [newCat, setNewCat] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    if (categories.includes(newCat.trim())) {
      alert('åˆ†é¡žå·²å­˜åœ¨');
      return;
    }
    setIsProcessing(true);
    try {
      const newList = [...categories, newCat.trim()];
      // å¯«å…¥åˆ°ç‰¹å®šè³‡æ–™å¤¾çš„è¨­å®šæª” (e.g., settings/categories_A)
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', `categories_${folder}`), { list: newList });
      setNewCat('');
    } catch (err) {
      console.error(err);
      alert('æ–°å¢žå¤±æ•—');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (catToDelete) => {
    if (catToDelete === 'é›¶ä»¶' || catToDelete === 'æˆå“') {
      alert('é è¨­åˆ†é¡žä¸å¯åˆªé™¤');
      return;
    }
    if (!confirm(`ç¢ºå®šè¦åˆªé™¤ã€Œ${catToDelete}ã€åˆ†é¡žå—Žï¼Ÿ`)) return;
    setIsProcessing(true);
    try {
      const newList = categories.filter(c => c !== catToDelete);
      await setDoc(doc(db, Û]´òÚ$z{-®éÜj×ÖSÒ'rÖgVÆÂÓ2ÂÓ&r×v†—FR&÷&FW"&÷&FW"×6ÆFRÓ#&÷VæFVB×†Â6†F÷r×6Ò÷WFÆ–æRÖæöæR"óãÅ6V&6‚6Æ74æÖSÒ&'6öÇWFRÆVgBÓ2F÷Ó2ãRFW‡B×6ÆFRÓC"6—¦S×³‡ÒóãÂöF—cà¢ÂöF—cà ¢²7W'&VçDföÆFW"bbvÆö&Å6V&6‚ò€¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó2ÖC¦w&–BÖ6öÇ2ÓbvÓB#à¢¶föÆFW'2æÖ†bÓâ€¢Æ'WGFöâ¶W“×¶gÒöä6Æ–6³×²‚“Óç6WD7W'&VçDföÆFW"†b—Ò6Æ74æÖSÒ&&r×v†—FRÓB&÷VæFVB×†Â6†F÷r×6Ò&÷&FW"fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"†÷fW#¦&rÖ–æF–vòÓSG&ç6—F–öâÖ6öÆ÷'2#à¢ÄföÆFW$÷Vâ6—¦S×³3'Ò6Æ74æÖSÒ'FW‡BÖ&ÇVRÓCÖ"Ó""óà¢Ç7â6Æ74æÖSÒ&föçBÖ&öÆBFW‡BÖÆrFW‡B×6ÆFRÓs#ç¶gÓÂ÷7ãà¢²ò¢i[Ž˜xþŠˆŽzé~˜(þ‹Êò¢÷Ð¢Ç7â6Æ74æÖSÒ'FW‡B×‡2&r×6ÆFRÓ‚Ó"’ÓãR&÷VæFVBFW‡B×6ÆFRÓS×BÓ#à¢¶–çfVçF÷'’æf–ÇFW"†’Óâ°¢6öç7B¶W’Ò†’ç'DçVÖ&W#òå³ÒÇÂ’ææÖSòå³ÒÇÂsòr’çFõWW$66R‚“°¢&WGW&â¶W’ÓÓÒc°¢Ò’æÆVæwF‡Òš^yºà¢Â÷7ãà¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢’¢€¢ÆF—b6Æ74æÖSÒ&&r×v†—FR&÷VæFVB×†Â6†F÷r×6Ò&÷&FW"÷fW&fÆ÷rÖ†–FFVâ&VÆF—fR#à¢²†—4FVÆWFTÖöFRÇÂ—4&F6„VF—DÖöFR’bbÆF—b6Æ74æÖS×¶'6öÇWFRF÷ÓÆVgBÓ&–v‡BÓÓ"¢ÓfÆW‚§W7F–g’Ö&WGvVVâG¶—4FVÆWFTÖöFSòv&r×&VBÓSFW‡B×&VBÓss¢v&rÖ&ÇVRÓSFW‡BÖ&ÇVRÓswÖÓãÇ7â6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBÖÂÓ"#ç¶—4FVÆWFTÖöFSö˜ŽXùbG·6VÆV7FVD–G2ç6—¦WÒzØf¢~h›žjÊKúîiKžjŠ[ÈòwÓÂ÷7ããÆ'WGFöâöä6Æ–6³×¶—4FVÆWFTÖöFS÷FövvÆTFVÆWFTÖöFS§FövvÆT&F6„VF—DÖöFWÒ6Æ74æÖSÒ&&r×v†—FR‚Ó2’Ó&÷VæFVB6†F÷r×6ÒFW‡B×‡2#îXùnkhƒÂö'WGFöãç¶—4FVÆWFTÖöFRbbÆ'WGFöâöä6Æ–6³×²‚“Óç6WE6†÷t6öæf—&ÔFVÆWFR‡G'VR—ÒF—6&ÆVC×²6VÆV7FVD–G2ç6—¦WÒ6Æ74æÖSÒ&&r×&VBÓcFW‡B×v†—FR‚Ó2’Ó&÷VæFVBFW‡B×‡26†F÷r×6ÒÖÂÓ"#îXŠ®™šCÂö'WGFöãçÓÂöF—cçÐ¢ÆF—b6Æ74æÖS×¶Ó2&÷&FW"Ö"fÆW‚§W7F–g’Ö&WGvVVâG¶—4VF—DÖöFSòv&rÖ÷&ævRÓSs¢v&rÖ&ÇVRÓSwÒG²†—4FVÆWFTÖöFWÇÆ—4&F6„VF—DÖöFR“òv×BÓs¢rwÖÓãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBfÆW‚vÓ"#ãÄföÆFW$÷Vâ6—¦S×³gÒóâ¶vÆö&Å6V&6‚ò~i	Î[¾{YiéÂr¢G¶7W'&VçDföÆFW'ÒšîXŠ^kˆ^YjæÓÂöƒ3ãÇ7â6Æ74æÖSÒ'FW‡B×‡2#îX[¶F—7Æ”—FV×2æÆVæwF‡ÒzØcÂ÷7ããÂöF—cà¢ÆF—b6Æ74æÖSÒ&÷fW&fÆ÷rÖWFòÖ‚Ö‚Õ³sWf…Ò#à¢ÇF&ÆR6Æ74æÖSÒ'rÖgVÆÂFW‡BÖÆVgBFW‡B×‡26Ó§FW‡B×6Ò#à¢ÇF†VB6Æ74æÖSÒ&&r×6ÆFRÓSföçB×6VÖ–&öÆB&÷&FW"Ö"7F–6·’F÷Ó¢Ó6†F÷r×6Ò#à¢ÇG#à¢¶—4FVÆWFTÖöFRbbÇF‚6Æ74æÖSÒ'Ó"rÓFW‡BÖ6VçFW"#ãÆ'WGFöâöä6Æ–6³×¶†æFÆU6VÆV7DÆÇÓãÄ6†V6µ7V&R6—¦S×³gÒóãÂö'WGFöããÂ÷FƒçÐ¢µ²~[¨þ‰™òrÂ~YÉbuÒæÖ†ƒÓãÇF‚¶W“×¶‡Ò6Æ74æÖS×¶Ó"&r×6ÆFRÓSG¶ƒÓÓÒ~YÉbsòwrÓBs¢rwÖÓç¶‡ÓÂ÷Fƒâ—Ð¢µ²~iiž‰™òrÂ~Y8YÒuÒæÖ†ƒÓãÅ6÷'D†VFW"¶W“×¶‡ÒÆ&VÃ×¶‡Ò6÷'D¶W“×¶ƒÓÓÒ~iiž‰™òsòw'DçVÖ&W"s¢væÖRwÒóâ—Ð¢ÇF‚6Æ74æÖSÒ'Ó"v†—FW76RÖæ÷w&&r×6ÆFRÓS#î[®ZûƒÂ÷Fƒâ ¢Å6÷'D†VFW"Æ&VÃÒ.Xˆnšâ"6÷'D¶W“Ò&6FVv÷'’"óà¢Å6÷'D†VFW"Æ&VÃÒ.iÙ‹:¢ŽŠhþjÂ’"6÷'D¶W“Ò&ÖFW&–Â"óà¢Å6÷'D†VFW"Æ&VÃÒ.šþˆ›""6÷'D¶W“Ò&6öÆ÷""óà¢ÇF‚6Æ74æÖSÒ'Ó"v†—FW76RÖæ÷w&&r×6ÆFRÓS#îX)žŠ‹³Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'Ó"v†—FW76RÖæ÷w&FW‡B×&–v‡B&r×6ÆFRÓS#î[ª¾ZÙƒÂ÷Fƒà¢¶—4VF—DÖöFRbbÅ6÷'D†VFW"Æ&VÃÒ.i»Niki˜.™i2"6÷'D¶W“Ò&Æ7EWFFVB"óçÐ¢¶—4VF—DÖöFRbb—4FVÆWFTÖöFRbb—4&F6„VF—DÖöFRbbÇF‚6Æ74æÖSÒ'Ó"FW‡BÖ6VçFW"&r×6ÆFRÓS#îi8ÞKÙÃÂ÷FƒçÐ¢Â÷G#à¢Â÷F†VCà¢ÇF&öG’6Æ74æÖSÒ&F—f–FR×’#à¢¶F—7Æ”—FV×2æÖ‚†—FVÒÂ–G‚’Óâ°¢6öç7B—4Æ÷rÒ—FVÒçVçF—G’Â†—FVÒç6fWG•7Fö6·ÇÃS“°¢6öç7BBÒ—4&F6„VF—DÖöFRò†&F6„VF—EfÇVW5¶—FVÒæ–EÒÇÂ—FVÒ’¢—FVÓ°¢ ¢òòF—7Æ’F‡VÖ&æ–À¢6öç7BF‡VÖ"Ò†—FVÒç†÷F÷2bb—FVÒç†÷F÷2æÆVæwF‚â’ò—FVÒç†÷F÷5³Ò¢—FVÒç†÷Fó°¢ ¢òò&W&RÆÂ–ÖvW2f÷"&Wf–Wp¢6öç7BÆÄ–ÖvW2Ò†—FVÒç†÷F÷2bb—FVÒç†÷F÷2æÆVæwF‚â’ò—FVÒç†÷F÷2¢†—FVÒç†÷Fòò¶—FVÒç†÷FõÒ¢µÒ“° ¢&WGW&â€¢ÇG"¶W“×¶—FVÒæ–GÒ6Æ74æÖS×¶†÷fW#¦&r×6ÆFRÓSG·6VÆV7FVD–G2æ†2†—FVÒæ–B“òv&r×&VBÓSs¢rwÖÓà¢¶—4FVÆWFTÖöFRbbÇFB6Æ74æÖSÒ'Ó"FW‡BÖ6VçFW"#ãÆ–çWBG—SÒ&6†V6¶&÷‚"6†V6¶VC×·6VÆV7FVD–G2æ†2†—FVÒæ–B—Òöä6†ævS×²‚“Óæ†æFÆU6VÆV7B†—FVÒæ–B—Ò6Æ74æÖSÒ'rÓB‚ÓB"óãÂ÷FCçÐ¢ÇFB6Æ74æÖSÒ'Ó"FW‡BÖ6VçFW"FW‡B×6ÆFRÓC#ç¶–G‚³ÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆF—b6Æ74æÖSÒ'rÓ‚Ó&r×v†—FR&÷&FW"&÷VæFVBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"7W'6÷"×ö–çFW""öä6Æ–6³×²‚“Óâ—4&F6„VF—DÖöFRbg6WE&Wf–Wt–ÖvW2†ÆÄ–ÖvW2—Óç·F‡VÖ#óÆ–Ör7&3×·F‡VÖ'Ò6Æ74æÖSÒ'rÖgVÆÂ‚ÖgVÆÂö&¦V7BÖ6öçF–â"óã£Ä–ÖvT–6öâ6—¦S×³gÒ6Æ74æÖSÒ'FW‡B×6ÆFRÓ3"óçÓÂöF—cãÂ÷FCà¢¶—4&F6„VF—DÖöFRò€¢Ãà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶Bç'DçVÖ&W'Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂw'DçVÖ&W"rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶BææÖWÒöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂvæÖRrÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶Bç6—¦WÒöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂw6—¦RrÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÇ6VÆV7BfÇVS×¶Bæ6FVv÷'—Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂv6FVv÷'’rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ#ç¶6FVv÷&–W2æÖ†3ÓãÆ÷F–öâ¶W“×¶7Óç¶7ÓÂö÷F–öãâ—ÓÂ÷6VÆV7CãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶BæÖFW&–ÇÒöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂvÖFW&–ÂrÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂÖ"Ó"Æ6V†öÆFW#Ò.iÙ‹:¢"óãÆ–çWBfÇVS×¶Bç7V7Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂw7V2rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"Æ6V†öÆFW#Ò.ŠhþjÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶Bæ6öÆ÷'Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂv6öÆ÷"rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBfÇVS×¶Bç&VÖ&·7Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂw&VÖ&·2rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂ"óãÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ãÆ–çWBG—SÒ&çVÖ&W""fÇVS×¶BçVçF—G—Òöä6†ævS×¶SÓæ†æFÆT&F6„6†ævR†—FVÒæ–BÂwVçF—G’rÆRçF&vWBçfÇVR—Ò6Æ74æÖSÒ&&÷&FW"&÷VæFVBrÖgVÆÂFW‡B×&–v‡B"óãÂ÷FCà¢Âóà¢’¢€¢Ãà¢ÇFB6Æ74æÖSÒ'Ó"föçBÖ&öÆB#ç¶—FVÒç'DçVÖ&W'ÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"föçBÖ&öÆB#ç¶—FVÒææÖWÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ç¶—FVÒç6—¦WÇÂrÒwÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#à¢Ç7â6Æ74æÖS×¶FW‡BÕ³…Ò‚ÓãR’ÓãR&÷VæFVB&÷&FW"G¶vWD6FVv÷'”6öÆ÷"†—FVÒæ6FVv÷'’—ÖÓç¶—FVÒæ6FVv÷'—ÓÂ÷7ãà¢Â÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ç¶—FVÒæÖFW&–ÇÇÂrÒwÒÇ7â6Æ74æÖSÒ'FW‡B×6ÆFRÓCFW‡B×‡2#ç¶—FVÒç7V7ÓÂ÷7ããÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"#ç¶—FVÒæ6öÆ÷'ÇÂrÒwÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'Ó"FW‡B×‡2#ç¶—FVÒç&VÖ&·7ÇÂrÒwÓÂ÷FCà¢ÇFB6Æ74æÖS×¶Ó"FW‡B×&–v‡BföçBÖ&öÆBG¶—4Æ÷sòwFW‡B×&VBÓcs¢wFW‡BÖ&ÇVRÓcwÖÓç¶—FVÒçVçF—G—ÓÂ÷FCà¢Âóà¢—Ð¢¶—4VF—DÖöFRbbÇFB6Æ74æÖSÒ'Ó"FW‡B×‡2FW‡B×6ÆFRÓCv†—FW76RÖæ÷w&#ç¶f÷&ÖEF–ÖR†—FVÒæÆ7EWFFVB—ÓÂ÷FCçÐ¢¶—4VF—DÖöFRbb—4FVÆWFTÖöFRbb—4&F6„VF—DÖöFRbbÇFB6Æ74æÖSÒ'Ó"fÆW‚§W7F–g’Ö6VçFW"#ãÆ'WGFöâöä6Æ–6³×²‚“Óæ÷VäFDÖöFÂ†—FVÒ—Ò6Æ74æÖSÒ'ÓFW‡B×6ÆFRÓC†÷fW#§FW‡BÖ–æF–vòÓc#ãÄVF—B6—¦S×³GÒóãÂö'WGFöããÂ÷FCçÐ¢Â÷G#à¢¢Ò—Ð¢Â÷F&öG“à¢Â÷F&ÆSà¢ÂöF—cà¢ÂöF—cà¢—Ð ¢¶—4FF–ærbb—4VF—DÖöFRbb€¢ÆF—b6Æ74æÖSÒ&f—†VB–ç6WBÓ&rÖ&Æ6²óc¢Õ³cÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"ÓB&6¶G&÷Ö&ÇW"×6Òæ–ÖFRÖ–âfFRÖ–â#à¢Æf÷&Òöå7V&Ö—C×¶†æFÆTf÷&Õ6fWÒ6Æ74æÖSÒ&&r×v†—FRrÖgVÆÂÖ‚×r×6ÒÓb&÷VæFVBÓ7†Â6†F÷rÓ'†Â76R×’ÓBÖ‚Ö‚Õ³“f…Ò÷fW&fÆ÷r×’ÖWFò#à¢ÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâ&÷&FW"Ö""Ó2#ãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBFW‡BÖÆr#ç¶VF—F–æt—FVÓò~{zŽ‹Êòs¢~ikZ)âwÞ‹8~ii“Âöƒ3ãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚“Óç6WD—4FF–ær†fÇ6R—ÓãÅ‚óãÂö'WGFöããÂöF—cà¢²VF—F–æt—FVÒbbÆF—b6Æ74æÖSÒ'ÓB&r×6ÆFRÓS&÷VæFVB×†ÂfÆW‚fÆW‚Ö6öÂvÓ"Ö"Ó"#ãÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#ãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×¶F÷væÆöD–×÷'EFV×ÆFWÒ6Æ74æÖSÒ&fÆW‚Ó&r×v†—FR&÷&FW"’Ó"&÷VæFVBFW‡B×‡2#îKˆ¾‹ÈžzøNiÊÃÂö'WGFöããÆF—b6Æ74æÖSÒ'&VÆF—fRfÆW‚Ó#ãÆ–çWBG—SÒ&f–ÆR"66WCÒ"æ77b"öä6†ævS×¶†æFÆT–×÷'D55gÒ6Æ74æÖSÒ&'6öÇWFR–ç6WBÓ÷6—G’Ó"óãÆ'WGFöâG—SÒ&'WGFöâ"6Æ74æÖSÒ'rÖgVÆÂ&rÖ&ÇVRÓcFW‡B×v†—FR’Ó"&÷VæFVBFW‡B×‡2#îXÊþXZ^j©NjƒÂö'WGFöããÂöF—cãÂöF—cãÂöF—cçÐ¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îiiž‰™òŽ[ø^Z²“ÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&Õ'DçVÖ&W'Òöä6†ævS×¶SÓç6WDf÷&Õ'DçVÖ&W"†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"&WV—&VBóãÂöF—cà¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îY8YÓÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&ÔæÖWÒöä6†ævS×¶SÓç6WDf÷&ÔæÖR†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"&WV—&VBóãÂöF—cà¢ ¢²ò¢†÷FòvÆÆW'’ÖævW"¢÷Ð¢ÆF—cà¢ÆÆ&VÂ6Æ74æÖSÒ&&Æö6²FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓCÖ"Ó#îyJ.Y8xZ~x˜rŽzÊÎKˆ[Ë^x+®[™Ú"“ÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó2vÓ"Ö"Ó"#à¢¶f÷&Õ†÷F÷2æÖ‚‡Â’’Óâ€¢ÆF—b¶W“×¶—Ò6Æ74æÖSÒ'&VÆF—fRw&÷W7V7B×7V&R&÷&FW"&÷VæFVBÖÆr÷fW&fÆ÷rÖ†–FFVâ&r×6ÆFRÓ#à¢Æ–Ör7&3×·Ò6Æ74æÖSÒ'rÖgVÆÂ‚ÖgVÆÂö&¦V7BÖ6÷fW""óà¢ÆF—b6Æ74æÖSÒ&'6öÇWFR–ç6WBÓ&rÖ&Æ6²ó3÷6—G’Ów&÷WÖ†÷fW#¦÷6—G’ÓG&ç6—F–öâÖ÷6—G’fÆW‚fÆW‚Ö6öÂ§W7F–g’Ö&WGvVVâÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’ÖVæB#ãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚“Óæ†æFÆU&VÖ÷fU†÷Fò†’—Ò6Æ74æÖSÒ&&r×&VBÓSFW‡B×v†—FRÓ&÷VæFVBÖgVÆÂ#ãÅG&6‚6—¦S×³'ÒóãÂö'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâ#à¢¶’âbbÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚“Óæ†æFÆTÖ÷fU†÷Fò†’ÂÓ—Ò6Æ74æÖSÒ&&r×v†—FRóƒÓ&÷VæFVB†÷fW#¦&r×v†—FR#ãÄ6†Wg&öäÆVgB6—¦S×³GÒóãÂö'WGFöãçÐ¢¶’Âf÷&Õ†÷F÷2æÆVæwF‚ÓbbÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚“Óæ†æFÆTÖ÷fU†÷Fò†’Â—Ò6Æ74æÖSÒ&&r×v†—FRóƒÓ&÷VæFVB†÷fW#¦&r×v†—FR#ãÄ6†Wg&öå&–v‡B6—¦S×³GÒóãÂö'WGFöãçÐ¢ÂöF—cà¢ÂöF—cà¢¶’ÓÓÒbbÆF—b6Æ74æÖSÒ&'6öÇWFRF÷ÓÆVgBÓ&r×–VÆÆ÷rÓCFW‡BÕ³—…ÒföçBÖ&öÆB‚ÓãR’ÓãR&÷VæFVBÖ'"#î[™Ú#ÂöF—cçÐ¢ÂöF—cà¢’—Ð¢ÆÆ&VÂ6Æ74æÖSÒ&&÷&FW"Ó"&÷&FW"ÖF6†VB&÷&FW"×6ÆFRÓ3&÷VæFVBÖÆrfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"FW‡B×6ÆFRÓC7W'6÷"×ö–çFW"†÷fW#¦&r×6ÆFRÓS†÷fW#¦&÷&FW"Ö–æF–vòÓC†÷fW#§FW‡BÖ–æF–vòÓSG&ç6—F–öâÖ6öÆ÷'27V7B×7V&R#à¢ÅÇW26—¦S×³#GÒóà¢Ç7â6Æ74æÖSÒ'FW‡BÕ³…Ò#îikZ)ãÂ÷7ãà¢Æ–çWBG—SÒ&f–ÆR"×VÇF—ÆR66WCÒ&–ÖvRò¢"6Æ74æÖSÒ&†–FFVâ"öä6†ævS×¶†æFÆTFE†÷F÷Òóà¢ÂöÆ&VÃà¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚Ó#ãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#î[®Zû‚Ž˜ŽZ²“ÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&Õ6—¦UfÇÒöä6†ævS×¶SÓç6WDf÷&Õ6—¦UfÂ†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"Æ6V†öÆFW#Ò.Xúþz›®y›Ò"óãÂöF—cà¢ÆF—b6Æ74æÖSÒ'rÓ#B#ãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îYjîKØÓÂöÆ&VÃãÇ6VÆV7BfÇVS×¶f÷&Õ6—¦UVæ—GÒöä6†ævS×¶SÓç6WDf÷&Õ6—¦UVæ—B†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB#ãÆ÷F–öãîˆ»Y³Âö÷F–öããÆ÷F–öãæÖÓÂö÷F–öããÂ÷6VÆV7CãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚Ó#à¢ÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îXˆnšãÂöÆ&VÃà¢Ç6VÆV7B ¢fÇVS×¶f÷&Ô6FVv÷'—Ò ¢öä6†ævS×¶SÓç6WDf÷&Ô6FVv÷'’†RçF&vWBçfÇVR—Ò ¢6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB ¢à¢¶6FVv÷&–W2æÖ†2ÓâÆ÷F–öâ¶W“×¶7ÒfÇVS×¶7Óç¶7ÓÂö÷F–öãâ—Ð¢Â÷6VÆV7Cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ó#ãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îiÙ‹:£ÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&ÔÖFW&–ÇÒöä6†ævS×¶SÓç6WDf÷&ÔÖFW&–Â†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"&WV—&VBóãÂöF—cà¢ÂöF—cà¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îiÙ‹:®ŠhþjÂŽXúþz›®y›Ò“ÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&Õ7V7Òöä6†ævS×¶SÓç6WDf÷&Õ7V2†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"óãÂöF—cà¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îšþˆ›#ÂöÆ&VÃãÆF—b6Æ74æÖSÒ&fÆW‚vÓ"×BÓ#ãÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"#ãÆ–çWBG—SÒ'&F–ò"6†V6¶VC×¶6öÆ÷$ÖöFSÓÓÒv&Æ6²wÒöä6†ævS×²‚“Óç·6WD6öÆ÷$ÖöFR‚v&Æ6²r“·6WD7W7FöÔ6öÆ÷%fÂ‚rr—×Ò6Æ74æÖSÒ&×"Ó"óî›¹ˆ›#ÂöÆ&VÃãÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"#ãÆ–çWBG—SÒ'&F–ò"6†V6¶VC×¶6öÆ÷$ÖöFSÓÓÒv7W7FöÒwÒöä6†ævS×²‚“Óç6WD6öÆ÷$ÖöFR‚v7W7FöÒr—Ò6Æ74æÖSÒ&×"Ó"óîX[nK¹cÂöÆ&VÃãÂöF—cç¶6öÆ÷$ÖöFSÓÓÒv7W7FöÒrbbÆ–çWBfÇVS×¶7W7FöÔ6öÆ÷%fÇÒöä6†ævS×¶SÓç·6WD7W7FöÔ6öÆ÷%fÂ†RçF&vWBçfÇVR—×Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB×BÓ""Æ6V†öÆFW#Ò.‹ËŽXZ^šþˆ›""óçÓÂöF—cà¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îX)žŠ‹²Ž˜ŽZ²“ÂöÆ&VÃãÆ–çWBfÇVS×¶f÷&Õ&VÖ&·7Òöä6†ævS×¶SÓç6WDf÷&Õ&VÖ&·2†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"óãÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#à¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#î[ª¾ZÙƒÂöÆ&VÃãÆ–çWBG—SÒ&çVÖ&W""fÇVS×¶f÷&ÕG—Òöä6†ævS×¶SÓç6WDf÷&ÕG’†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"&WV—&VBóãÂöF—cà¢ÆF—cãÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓC#îZèžXZŽ[ª¾ZÙƒÂöÆ&VÃãÆ–çWBG—SÒ&çVÖ&W""fÇVS×¶f÷&Õ6fWG•7Fö6·Òöä6†ævS×¶SÓç6WDf÷&Õ6fWG•7Fö6²†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ'rÖgVÆÂÓ"&÷&FW"&÷VæFVB"óãÂöF—cà¢ÂöF—cà¢Æ'WGFöâ6Æ74æÖSÒ'rÖgVÆÂ&rÖ–æF–vòÓcFW‡B×v†—FR’Ó2&÷VæFVB×†ÂföçBÖ&öÆB×BÓ"#îXK.ZÙƒÂö'WGFöãà¢Âöf÷&Óà¢ÂöF—cà¢—Ð¢ÂöF—cà¢“°§Ð