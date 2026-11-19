// Geistdocs has no TypeSafe AI logo. Mark from TypeSafe AI's n8n node
// (typesafe-ai/n8n-nodes-typesafe-ai), recolored to currentColor and sized like
// the geistdocs logo icons (size sets the height).
export function LogoIconTypeSafeAi({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 14 20"
      width={(size * 14) / 20}
    >
      <path
        clipRule="evenodd"
        d="M10.6301 2.43964V5.88867L13.7385 7.90595L13.7393 15.5432L6.86876 20L3.1092 17.5613V14.0167L0 11.9995V4.45774L0.295985 4.26514L6.86957 0L10.6301 2.43964ZM4.95015 17.2083L6.86794 18.4526L11.8959 15.1892L9.97891 13.9459L4.95015 17.2083ZM7.51816 8.61043V12.0003L4.40814 14.0176V16.0128L9.33113 12.8189V7.43449L7.51816 8.61043ZM10.6301 12.8206L12.4397 13.9947V8.60962L10.6301 7.43544V12.8206ZM1.84176 11.6473L3.75874 12.8916L5.67653 11.6473L3.75955 10.4038L1.84176 11.6473ZM1.2988 5.1614V10.4527L3.1092 9.27775V5.88786L6.22017 3.86895V1.96737L1.2988 5.1614ZM4.40814 9.27694L6.21935 10.4519V8.60962L4.40814 7.43449V9.27694ZM4.95015 6.23929L6.86957 7.4844L8.7875 6.2401L6.86876 4.99498L4.95015 6.23929ZM7.51911 3.86895L9.33113 5.04476V3.14412L7.51911 1.96737V3.86895Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
