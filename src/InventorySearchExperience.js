import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Edit3,
  Filter,
  FolderOpen,
  Package,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import './InventoryPreview.css';

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemFolder(item) {
  return (item.partNumber?.[0] || item.name?.[0] || '其他').toUpperCase();
}

function stockState(item) {
  const quantity = numberValue(item.quantity);
  const safety = numberValue(item.safetyStock || 5000);
  if (quantity === 0) return { key: 'empty', label: '零庫存' };
  if (quantity < safety) return { key: 'low', label: '低於安全庫存' };
  return { key: 'normal', label: '庫存正常' };
}

function ProductVisual({ item, large = false }) {
  const photo = item.photos?.[0] || item.photo;
  if (photo) {
    return <div className={`inventory-preview-product-mark inventory-live-product-photo ${large ? 'is-large' : ''}`}><img src={photo} alt="" /></div>;
  }
  return <div className={`inventory-preview-product-mark ${large ? 'is-large' : ''}`} aria-hidden="true"><Package size={large ? 34 : 22} /></div>;
}

export default function InventorySearchExperience({ inventory, onEnterManage, onExport }) {
  const folders = useMemo(() => [...new Set(inventory.map(itemFolder))].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })), [inventory]);
  const categories = useMemo(() => [...new Set(inventory.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')), [inventory]);
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (!folder && folders.length) setFolder(folders[0]);
  }, [folder, folders]);

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesFolder = keyword ? true : itemFolder(item) === folder;
      const matchesSearch = !keyword || [item.partNumber, item.name, item.material, item.spec, item.color, item.remarks]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
      const matchesStock = stockFilter === 'all' || stockState(item).key === stockFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesFolder && matchesSearch && matchesStock && matchesCategory;
    });
  }, [categoryFilter, folder, inventory, query, stockFilter]);

  const selectedFolderItems = useMemo(() => inventory.filter((item) => itemFolder(item) === folder), [folder, inventory]);
  const lowCount = selectedFolderItems.filter((item) => stockState(item).key !== 'normal').length;

  return (
    <div className="inventory-live-experience">
      <div className="inventory-preview-page-heading inventory-live-heading">
        <div>
          <div className="inventory-preview-breadcrumb"><button type="button" onClick={() => setQuery('')}>庫存查詢</button><ChevronRight size={14} /><span>{query ? '搜尋結果' : `${folder || '—'} 系列`}</span></div>
          <h1>{query ? '搜尋結果' : `${folder || '—'} 系列庫存`}</h1>
          <p>快速查找產品、確認現有庫存與安全存量。</p>
        </div>
        <div className="inventory-preview-heading-actions">
          <button type="button" className="inventory-preview-secondary-button" onClick={() => onExport(visibleItems)}><Download size={17} />匯出資料</button>
          <button type="button" className="inventory-preview-primary-button" onClick={onEnterManage}><Edit3 size={17} />管理資料</button>
        </div>
      </div>

      <section className="inventory-preview-search-panel inventory-live-search-panel" aria-label="庫存搜尋與篩選">
        <label className="inventory-preview-search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料號、品名、材質、規格或顏色" />{query && <button type="button" aria-label="清除搜尋" onClick={() => setQuery('')}><X size={17} /></button>}</label>
        <label className="inventory-preview-select-wrap"><Filter size={17} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部分類</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="inventory-preview-select-wrap"><ShieldCheck size={17} /><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="all">全部庫存狀態</option><option value="normal">庫存正常</option><option value="low">低於安全庫存</option><option value="empty">零庫存</option></select></label>
      </section>

      {!query && <section className="inventory-preview-folders inventory-live-folders" aria-label="產品系列">
        {folders.map((entry) => {
          const items = inventory.filter((item) => itemFolder(item) === entry);
          const alertCount = items.filter((item) => stockState(item).key !== 'normal').length;
          return <button type="button" key={entry} className={folder === entry ? 'is-selected' : ''} onClick={() => setFolder(entry)}>
            <div className="inventory-preview-folder-icon"><FolderOpen size={23} /></div>
            <div><strong>{entry} 系列產品</strong><span>{items.length} 個品項</span></div>
            {alertCount > 0 && <span className="inventory-preview-folder-alert"><AlertTriangle size={13} />{alertCount}</span>}
          </button>;
        })}
      </section>}

      <section className="inventory-preview-list-section">
        <div className="inventory-preview-list-header">
          <div><h2>{query ? `「${query}」的搜尋結果` : `${folder} 系列品項`}</h2><span>共 {visibleItems.length} 筆資料{!query && lowCount > 0 ? `・${lowCount} 筆需注意` : ''}</span></div>
          <div className="inventory-preview-status-legend"><span><i className="normal" />正常</span><span><i className="low" />低庫存</span><span><i className="empty" />零庫存</span></div>
        </div>

        <div className="inventory-preview-table-wrap">
          <table><thead><tr><th>產品</th><th>分類／規格</th><th>顏色</th><th>備註</th><th className="is-number">現有庫存</th><th>狀態</th><th>最後更新</th><th aria-label="操作" /></tr></thead>
            <tbody>{visibleItems.map((item) => {
              const state = stockState(item);
              return <tr key={item.id} onClick={() => setSelectedItem(item)}>
                <td><div className="inventory-preview-product-cell"><ProductVisual item={item} /><div><strong>{item.partNumber || '未設定料號'}</strong><span>{item.name || '未設定品名'}</span></div></div></td>
                <td><strong>{item.category || '未分類'}</strong><span>{[item.material, item.spec, item.size].filter(Boolean).join('・') || '—'}</span></td>
                <td>{item.color || '—'}</td><td>{item.remarks || '—'}</td>
                <td className="is-number"><strong>{numberValue(item.quantity).toLocaleString()}</strong><span>PCS</span></td>
                <td><span className={`inventory-preview-status ${state.key}`}><i />{state.label}</span></td>
                <td>{item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td><button type="button" aria-label={`查看 ${item.partNumber || item.name}`}><ChevronRight size={18} /></button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>

        <div className="inventory-preview-mobile-cards">{visibleItems.map((item) => {
          const state = stockState(item);
          return <button type="button" key={item.id} onClick={() => setSelectedItem(item)}>
            <div className="inventory-preview-mobile-product"><ProductVisual item={item} /><div><strong>{item.partNumber || '未設定料號'}</strong><span>{item.name || '未設定品名'}</span></div><ChevronRight size={18} /></div>
            <div className="inventory-preview-mobile-stock"><div><span>現有庫存</span><strong>{numberValue(item.quantity).toLocaleString()} <small>PCS</small></strong></div><span className={`inventory-preview-status ${state.key}`}><i />{state.label}</span></div>
            <div className="inventory-preview-mobile-meta"><span>{[item.material, item.spec].filter(Boolean).join('・') || '未設定規格'}</span><span>{item.category || '未分類'}</span></div>
          </button>;
        })}</div>

        {visibleItems.length === 0 && <div className="inventory-preview-empty"><Search size={28} /><strong>找不到符合條件的品項</strong><span>請調整搜尋文字或篩選條件。</span></div>}
      </section>

      {selectedItem && <div className="inventory-preview-drawer-backdrop" onMouseDown={() => setSelectedItem(null)}><aside className="inventory-preview-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="品項詳細資料">
        <div className="inventory-preview-drawer-head"><div><span>品項詳細資料</span><strong>{selectedItem.partNumber || '未設定料號'}</strong></div><button type="button" aria-label="關閉" onClick={() => setSelectedItem(null)}><X size={20} /></button></div>
        <div className="inventory-preview-drawer-product"><ProductVisual item={selectedItem} large /><div><h2>{selectedItem.name || '未設定品名'}</h2><p>{selectedItem.category || '未分類'}</p></div></div>
        <div className={`inventory-preview-stock-summary ${stockState(selectedItem).key}`}><div><span>現有庫存</span><strong>{numberValue(selectedItem.quantity).toLocaleString()} <small>PCS</small></strong></div><div><span>安全庫存</span><strong>{numberValue(selectedItem.safetyStock || 5000).toLocaleString()} <small>PCS</small></strong></div><span className={`inventory-preview-status ${stockState(selectedItem).key}`}><i />{stockState(selectedItem).label}</span></div>
        <section className="inventory-preview-detail-section"><h3>產品資料</h3><dl><div><dt>材質／規格</dt><dd>{[selectedItem.material, selectedItem.spec].filter(Boolean).join('・') || '—'}</dd></div><div><dt>尺寸</dt><dd>{selectedItem.size || '—'}</dd></div><div><dt>顏色</dt><dd>{selectedItem.color || '—'}</dd></div><div><dt>備註</dt><dd>{selectedItem.remarks || '—'}</dd></div><div><dt>最後更新者</dt><dd>{selectedItem.lastEditor || '—'}</dd></div><div><dt>最後更新</dt><dd>{selectedItem.lastUpdated ? new Date(selectedItem.lastUpdated).toLocaleString('zh-TW') : '—'}</dd></div></dl></section>
        {selectedItem.photos?.length > 1 && <section className="inventory-preview-detail-section"><h3>產品照片</h3><div className="inventory-live-photo-grid">{selectedItem.photos.map((photo, index) => <img key={index} src={photo} alt={`${selectedItem.name || '產品'} ${index + 1}`} />)}</div></section>}
        <div className="inventory-preview-drawer-actions"><button type="button" className="inventory-preview-secondary-button" onClick={() => setSelectedItem(null)}>關閉</button><button type="button" className="inventory-preview-primary-button" onClick={onEnterManage}><Edit3 size={17} />進入管理模式</button></div>
      </aside></div>}
    </div>
  );
}
