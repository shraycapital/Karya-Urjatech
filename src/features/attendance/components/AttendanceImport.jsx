import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { db } from '../../../firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';

export default function AttendanceImport({ t }) {
  const [rows, setRows] = useState([]); // preview only (first 20)
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const parserRef = useRef(null);

  const BATCH_SIZE = 400; // below Firestore 500 limit for safety

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRows([]);
    setImportedCount(0);
    setSkippedCount(0);
    setMessage('');
    setIsStreaming(true);

    let batch = writeBatch(db);
    let batchCount = 0;
    let previewCount = 0;

    const commitBatch = async () => {
      if (batchCount === 0) return;
      await batch.commit();
      setImportedCount((c) => c + batchCount);
      batch = writeBatch(db);
      batchCount = 0;
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      chunkSize: 1024 * 64, // 64KB chunks
      chunk: async (results, parser) => {
        parserRef.current = parser;
        parser.pause();
        try {
          for (const raw of results.data || []) {
            const r = normalizeRow(raw);
            if (!r.employeeId || !r.date) { setSkippedCount((s) => s + 1); continue; }
            const docId = `${r.employeeId}_${r.date}`;
            batch.set(doc(collection(db, 'attendance'), docId), r, { merge: true });
            batchCount += 1;

            if (previewCount < 20) {
              previewCount += 1;
              setRows((prev) => prev.length < 20 ? [...prev, r] : prev);
            }

            if (batchCount >= BATCH_SIZE) {
              await commitBatch();
            }
          }
        } catch (err) {
          setMessage(err?.message || 'Error during import');
        } finally {
          parser.resume();
        }
      },
      complete: async () => {
        try {
          await commitBatch();
          setMessage(`${t('rowsImported') || 'rows imported'}: ${importedCount} • ${t('skipped') || 'skipped'}: ${skippedCount}`);
        } catch (e) {
          setMessage(e?.message || 'Import finalize failed');
        } finally {
          setIsStreaming(false);
        }
      },
      error: (err) => {
        setIsStreaming(false);
        setMessage(err?.message || 'Failed to parse CSV');
      }
    });
  };

  const normalizeRow = (r) => {
    // Try common header variants including the new schema
    const employeeId = r['imp_id'] || r['IMP. ID'] || r['EMP ID'] || r['EMPID'] || r['employeeId'] || r['Employee ID'] || r['Emp Id'] || r['EmpID'] || '';
    const date = r['date'] || r['Date'] || r['DATE'] || '';
    const inTime = r['in_time'] || r['In time'] || r['In Time'] || r['INTIME'] || r['IN'] || r['inTime'] || '';
    const outTime = r['out_time'] || r['Out time'] || r['Out Time'] || r['OUTTIME'] || r['OUT'] || r['outTime'] || '';
    const ot = r['ot_time'] || r['OT hours'] || r['OT Hours'] || r['OT'] || r['Overtime'] || r['otHours'] || '';
    return {
      employeeId: String(employeeId || '').trim(),
      date: toIsoDate(date),
      inTime: String(inTime || '').trim(),
      outTime: String(outTime || '').trim(),
      otHours: parseOt(ot)
    };
  };

  const toIsoDate = (x) => {
    if (!x) return '';
    // Accept formats like DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY
    const s = String(x).trim();
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    
    // DD/MM/YYYY or D/M/YYYY format
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m1) {
      const d = m1[1].padStart(2, '0');
      const mo = m1[2].padStart(2, '0');
      const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
      return `${y}-${mo}-${d}`;
    }
    
    // DD-MM-YYYY or D-M-YYYY format
    const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (m2) {
      const d = m2[1].padStart(2, '0');
      const mo = m2[2].padStart(2, '0');
      const y = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
      return `${y}-${mo}-${d}`;
    }
    
    return s;
  };

  const parseOt = (x) => {
    if (typeof x === 'number') return x;
    const s = String(x || '').trim();
    if (!s) return 0;
    
    // Handle time format like "2:30" (2 hours 30 minutes)
    const timeMatch = s.match(/^(\d+):(\d+)$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      return hours + (minutes / 60);
    }
    
    // Handle decimal format
    const num = parseFloat(s.replace(',', '.'));
    return isNaN(num) ? 0 : num;
  };

  const importRows = async () => {
    // Legacy button now acts as resume if paused
    if (parserRef.current && isStreaming) {
      parserRef.current.resume?.();
    }
  };

  return (
    <div className="space-y-3">
      <input type="file" accept=".csv" onChange={handleFile} className="input" />
      <div className="text-xs text-slate-600">
        {t('note') || 'Note'}: {t('largeCsvStreaming') || 'Large CSVs are streamed and written in safe batches.'}
      </div>
      <div className="text-xs text-slate-700">
        {t('progress') || 'Progress'}: {importedCount} {t('imported') || 'imported'} • {skippedCount} {t('skipped') || 'skipped'}
      </div>
      {rows.length > 0 && (
        <div className="text-xs text-slate-600">{rows.length} {t('rowsReady') || 'rows previewed'} • {t('preview') || 'Preview'}:</div>
      )}
      {rows.length > 0 && (
        <div className="max-h-48 overflow-auto border rounded">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-1">{t('employeeId') || 'Employee ID'}</th>
                <th className="text-left p-1">{t('date') || 'Date'}</th>
                <th className="text-left p-1">{t('inTime') || 'In'}</th>
                <th className="text-left p-1">{t('outTime') || 'Out'}</th>
                <th className="text-left p-1">{t('otHours') || 'OT (h)'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1">{r.employeeId}</td>
                  <td className="p-1">{r.date}</td>
                  <td className="p-1">{r.inTime}</td>
                  <td className="p-1">{r.outTime}</td>
                  <td className="p-1">{r.otHours}</td>
                </tr>
              ))}
              {rows.length > 50 && (
                <tr>
                  <td colSpan={5} className="p-1 text-slate-500">+ {rows.length - 50} more…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button disabled={isStreaming} onClick={importRows} className="btn btn-primary">
          {isStreaming ? (t('importing') || 'Importing…') : (t('startImport') || 'Start/Resume Import')}
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </div>
  );
}



