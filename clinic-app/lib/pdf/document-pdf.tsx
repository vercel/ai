import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface DocumentPdfProps {
  clinic: {
    name: string;
    document_number: string | null;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
    letterhead_url: string | null;
  };
  patient: { full_name: string };
  document: {
    title: string;
    content: string;
    created_at: string;
    signed_at: string;
    content_hash: string;
    signer_ip: string | null;
    professional_name: string;
    council_registration: string | null;
  };
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#1f2937' },
  letterhead: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  logo: { height: 40, marginBottom: 8, objectFit: 'contain' },
  clinicName: { fontSize: 16, fontWeight: 700 },
  clinicMeta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginVertical: 16 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  label: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  value: { fontSize: 11, marginBottom: 10 },
  content: { fontSize: 11, lineHeight: 1.5, marginBottom: 24 },
  auditBox: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, padding: 12, marginTop: 'auto' },
  auditTitle: { fontSize: 10, fontWeight: 700, marginBottom: 6 },
  auditLine: { fontSize: 8, color: '#4b5563', marginBottom: 2 },
});

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

export function DocumentPdf({ clinic, patient, document }: DocumentPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {clinic.letterhead_url && <Image src={clinic.letterhead_url} style={styles.letterhead} fixed />}

        <View>
          {clinic.logo_url && <Image src={clinic.logo_url} style={styles.logo} />}
          <Text style={styles.clinicName}>{clinic.name}</Text>
          <Text style={styles.clinicMeta}>
            {clinic.document_number ? `CNPJ ${clinic.document_number}` : null}
            {clinic.address ? ` · ${clinic.address}` : null}
            {clinic.phone ? ` · ${clinic.phone}` : null}
          </Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.title}>{document.title}</Text>

        <Text style={styles.label}>Paciente</Text>
        <Text style={styles.value}>{patient.full_name}</Text>

        <Text style={styles.label}>Data do atendimento</Text>
        <Text style={styles.value}>{formatDateTime(document.created_at)}</Text>

        <Text style={styles.content}>{document.content}</Text>

        <View style={styles.auditBox}>
          <Text style={styles.auditTitle}>Validade jurídica</Text>
          <Text style={styles.auditLine}>
            Documento assinado eletronicamente por {document.professional_name}
            {document.council_registration ? ` - ${document.council_registration}` : ''}
          </Text>
          <Text style={styles.auditLine}>Hash de integridade (SHA-256): {document.content_hash}</Text>
          <Text style={styles.auditLine}>IP do assinante: {document.signer_ip ?? 'não registrado'}</Text>
          <Text style={styles.auditLine}>Assinado em: {formatDateTime(document.signed_at)}</Text>
        </View>
      </Page>
    </Document>
  );
}
