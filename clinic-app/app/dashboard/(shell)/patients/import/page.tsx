import Link from 'next/link';
import { PatientCsvImporter } from '@/components/patient-csv-importer';

export default function PatientImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-xs text-gray-400">
        <Link href="/dashboard/patients" className="hover:underline">Pacientes</Link> / Importar CSV
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-brand-700">Importador de pacientes em massa</h1>
      <p className="mb-6 text-sm text-gray-500">
        O arquivo é lido inteiramente no seu navegador — nada é enviado ao servidor até você mapear
        as colunas e confirmar a importação.
      </p>
      <PatientCsvImporter />
    </div>
  );
}
