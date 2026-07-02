'use client';

import { useRef, useState } from 'react';
import { UploadCloud, FileText, Download, Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  addAppointmentAttachment,
  deleteAppointmentAttachment,
  getAppointmentAttachmentSignedUrl,
} from '@/app/dashboard/(shell)/minha-agenda/[appointment_id]/actions';
import type { AppointmentAttachment } from '@/lib/types';

export function AppointmentAttachmentUploader({
  appointmentId,
  patientId,
  attachments,
}: {
  appointmentId: string;
  patientId: string;
  attachments: AppointmentAttachment[];
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    for (const file of Array.from(files)) {
      const path = `${appointmentId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('clinical-records').upload(path, file);

      if (uploadError) {
        setError('Não foi possível enviar um ou mais arquivos.');
        continue;
      }

      await addAppointmentAttachment(appointmentId, patientId, path, file.name);
    }

    setUploading(false);
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm md:col-span-2">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Anexar Exames/Imagens</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300'
        }`}
      >
        <UploadCloud size={28} className="text-brand-500" />
        <p className="text-sm text-gray-600">
          {uploading ? 'Enviando...' : 'Arraste exames/imagens aqui ou clique para selecionar'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {attachments.map((attachment) => (
          <AttachmentRow key={attachment.id} appointmentId={appointmentId} attachment={attachment} />
        ))}
        {attachments.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum anexo enviado ainda.</p>
        )}
      </div>
    </div>
  );
}

function AttachmentRow({
  appointmentId,
  attachment,
}: {
  appointmentId: string;
  attachment: AppointmentAttachment;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <FileText size={16} className="text-gray-400" />
        {attachment.file_name}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            const url = await getAppointmentAttachmentSignedUrl(attachment.file_url);
            setLoading(false);
            if (url) window.open(url, '_blank');
          }}
          className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <Download size={14} />
          {loading ? 'Gerando...' : 'Baixar'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('Remover este anexo?')) {
              deleteAppointmentAttachment(appointmentId, attachment.id);
            }
          }}
          className="text-gray-400 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
