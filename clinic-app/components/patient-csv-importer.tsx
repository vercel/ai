'use client';

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileSpreadsheet } from 'lucide-react';
import {
  importPatientsBulk,
  type ImportedPatientRow,
  type ImportPatientsResult,
} from '@/app/dashboard/(shell)/patients/import/actions';

const FIELDS: { key: keyof ImportedPatientRow; label: string }[] = [
  { key: 'full_name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'cpf', label: 'CPF' },
  { key: 'phone', label: 'Telefone' },
  { key: 'birth_date', label: 'Data de nascimento' },
  { key: 'gender', label: 'Gênero' },
];

function guessField(header: string): keyof ImportedPatientRow | '' {
  const normalized = header.trim().toLowerCase();
  if (/nome/.test(normalized)) return 'full_name';
  if (/e-?mail/.test(normalized)) return 'email';
  if (/cpf/.test(normalized)) return 'cpf';
  if (/telefone|celular|whatsapp|phone/.test(normalized)) return 'phone';
  if (/nascimento|birth/.test(normalized)) return 'birth_date';
  if (/g[êe]nero|sexo/.test(normalized)) return 'gender';
  return '';
}

export function PatientCsvImporter() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportPatientsResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const detectedHeaders = parsed.meta.fields ?? [];
        setHeaders(detectedHeaders);
        setRows(parsed.data);

        const initialMapping: Record<string, string> = {};
        detectedHeaders.forEach((header) => {
          initialMapping[header] = guessField(header);
        });
        setMapping(initialMapping);
      },
    });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    setImporting(true);
    setResult(null);

    const mappedRows: ImportedPatientRow[] = rows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const header of headers) {
        const field = mapping[header];
        if (field) {
          mapped[field] = row[header] ?? '';
        }
      }
      return mapped as unknown as ImportedPatientRow;
    });

    const outcome = await importPatientsBulk(mappedRows);
    setImporting(false);
    setResult(outcome);
  }

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (result && !result.error) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-3 text-lg font-semibold text-gray-800">
          {result.imported} pacientes importados com sucesso!
        </h2>
        {result.skipped > 0 && (
          <p className="mt-1 text-sm text-gray-500">
            {result.skipped} linha(s) ignorada(s) por falta de nome.
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Importar outro arquivo
        </button>
      </div>
    );
  }

  if (headers.length === 0) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white'
        }`}
      >
        <UploadCloud size={40} className="text-brand-500" />
        <p className="text-sm font-medium text-gray-700">
          Arraste um arquivo CSV aqui ou clique para selecionar
        </p>
        <p className="text-xs text-gray-400">Cabeçalhos na primeira linha, ex: nome, cpf, telefone...</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <FileSpreadsheet size={18} className="text-brand-500" />
        <span className="font-medium">{fileName}</span>
        <span className="text-gray-400">· {rows.length} linha(s) detectada(s)</span>
      </div>

      {result?.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{result.error}</p>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Mapeamento de colunas</h2>
      <div className="flex flex-col gap-2">
        {headers.map((header) => (
          <div key={header} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
            <span className="w-40 shrink-0 truncate text-sm font-medium text-gray-700">{header}</span>
            <select
              value={mapping[header] ?? ''}
              onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Ignorar esta coluna</option>
              {FIELDS.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!Object.values(mapping).includes('full_name') && (
        <p className="mt-3 text-xs text-amber-600">
          Mapeie ao menos uma coluna para "Nome" — é o único campo obrigatório.
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={importing || !Object.values(mapping).includes('full_name')}
          onClick={handleImport}
          className="rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {importing ? 'Importando...' : `Iniciar importação (${rows.length} registros)`}
        </button>
      </div>
    </div>
  );
}
