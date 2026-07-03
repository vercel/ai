import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  PatientPortalTabs,
  type PortalAppointment,
  type PortalCertificate,
  type PortalDocument,
  type PortalInvoice,
  type PortalPrescription,
} from '@/components/patient-portal-tabs';

export default async function PatientPortalPage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: context } = await supabase.rpc('get_patient_portal_context', {
    p_token: params.token,
  });

  if (!context) {
    notFound();
  }

  const [{ data: appointments }, { data: documentsData }, { data: invoices }] = await Promise.all([
    supabase.rpc('get_patient_portal_appointments', { p_token: params.token }),
    supabase.rpc('get_patient_portal_documents', { p_token: params.token }),
    supabase.rpc('get_patient_portal_financial', { p_token: params.token }),
  ]);

  return (
    <PatientPortalTabs
      token={params.token}
      patientName={context.full_name}
      appointments={(appointments ?? []) as PortalAppointment[]}
      prescriptions={(documentsData?.prescriptions ?? []) as PortalPrescription[]}
      certificates={(documentsData?.certificates ?? []) as PortalCertificate[]}
      documents={(documentsData?.documents ?? []) as PortalDocument[]}
      invoices={(invoices ?? []) as PortalInvoice[]}
    />
  );
}
