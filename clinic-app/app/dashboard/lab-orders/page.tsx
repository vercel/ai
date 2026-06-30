import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LabOrder, Patient } from '@/lib/types';
import { LabOrderStatusSelect } from '@/components/lab-order-status-select';
import { LabOrderResultForm } from '@/components/lab-order-result-form';
import { DeleteLabOrderButton } from '@/components/delete-lab-order-button';

type LabOrderRow = LabOrder & { patients: Pick<Patient, 'full_name'> };

export default async function LabOrdersPage() {
  const supabase = createSupabaseServerClient();
  const { data: orders } = await supabase
    .from('lab_orders')
    .select('*, patients(full_name)')
    .order('requested_at', { ascending: false })
    .returns<LabOrderRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Controle de laboratório</h1>
        <Link
          href="/dashboard/lab-orders/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo exame
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {(orders ?? []).map((order) => (
          <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">{order.exam_name}</h2>
                <p className="text-xs text-gray-400">
                  {order.patients?.full_name} ·{' '}
                  {new Date(order.requested_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <LabOrderStatusSelect id={order.id} status={order.status} />
                <DeleteLabOrderButton id={order.id} />
              </div>
            </div>
            <LabOrderResultForm id={order.id} resultText={order.result_text} />
          </div>
        ))}
        {(orders ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum exame cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
