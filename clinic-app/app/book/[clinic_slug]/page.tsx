import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BookingWizard } from '@/components/booking-wizard';

export default async function PublicBookingPage({
  params,
}: {
  params: { clinic_slug: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: clinic } = await supabase.rpc('get_public_clinic', { p_slug: params.clinic_slug });

  if (!clinic) {
    notFound();
  }

  const { data: specialties } = await supabase.rpc('get_public_specialties', {
    p_slug: params.clinic_slug,
  });

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
            Agendamento online
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-800">{clinic.name}</h1>
        </div>
        <BookingWizard
          clinicSlug={params.clinic_slug}
          clinicName={clinic.name}
          specialties={(specialties ?? []) as string[]}
        />
      </div>
    </div>
  );
}
