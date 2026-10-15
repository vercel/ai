/**
 * Framework icons that the Geistdocs asset set does not ship (Node.js, Nuxt,
 * Expo, and the generic "puzzle" fallback), ported verbatim from the legacy
 * app (ai-studio packages/components/docs/icons.tsx).
 *
 * Node.js and Nuxt keep their brand fills. Expo and the puzzle fallback render
 * `currentColor`, so wrap them with a text color class (the docs app uses
 * `text-gray-1000` for logos and `text-gray-700` for muted glyphs).
 */

export const NodeIcon = ({ size = 16 }: { size?: number }) => {
  return (
    <svg
      data-testid="geist-icon"
      height={size}
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      width={size}
      style={{ color: 'currentcolor' }}
    >
      <mask
        id="mask0_872_3158"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="1"
        y="0"
        width="14"
        height="16"
      >
        <path
          d="M7.62322 0.101215L1.37744 3.72072C1.1435 3.85617 1 4.10623 1 4.37653V11.6206C1 11.8911 1.1435 12.141 1.37744 12.2764L7.62367 15.8987C7.85716 16.0338 8.14506 16.0338 8.37826 15.8987L14.6234 12.2764C14.8562 12.141 15 11.8909 15 11.6206V4.37653C15 4.10623 14.8562 3.85617 14.622 3.72072L8.37767 0.101215C8.26055 0.0337871 8.13009 0 7.99963 0C7.86917 0 7.73871 0.0337871 7.62159 0.101215"
          fill="white"
        />
      </mask>
      <g mask="url(#mask0_872_3158)">
        <path
          d="M21.3115 3.10613L3.71197 -5.55525L-5.31201 12.9276L12.2871 21.5894L21.3115 3.10613Z"
          fill="url(#paint0_linear_872_3158)"
        />
      </g>
      <mask
        id="mask1_872_3158"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="1"
        y="0"
        width="14"
        height="16"
      >
        <path
          d="M1.15454 12.0805C1.21429 12.1584 1.289 12.2258 1.37692 12.2764L6.73468 15.3836L7.62714 15.8986C7.76057 15.976 7.91267 16.0087 8.06211 15.9976C8.11192 15.9936 8.16173 15.9842 8.21036 15.9703L14.7977 3.86019C14.7473 3.80511 14.6883 3.75897 14.6222 3.72027L10.5325 1.34915L8.37077 0.100323C8.30939 0.0646001 8.24282 0.0392964 8.17507 0.0214348L1.15454 12.0805Z"
          fill="white"
        />
      </mask>
      <g mask="url(#mask1_872_3158)">
        <path
          d="M-6.45459 5.66793L5.97248 22.555L22.4075 10.3636L9.97968 -6.52305L-6.45459 5.66793Z"
          fill="url(#paint1_linear_872_3158)"
        />
      </g>
      <mask
        id="mask2_872_3158"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="1"
        y="0"
        width="14"
        height="16"
      >
        <path
          d="M7.92494 0.00417044C7.82013 0.0145897 7.71769 0.0473349 7.62325 0.101217L1.39526 3.7103L8.11099 15.9916C8.20439 15.9782 8.29631 15.947 8.37933 15.8988L14.6251 12.2764C14.8178 12.1642 14.9498 11.9743 14.9898 11.759L8.14361 0.0165236C8.0932 0.00655088 8.0428 0.00134277 7.99091 0.00134277C7.97016 0.00134277 7.9494 0.00238306 7.92865 0.00431807"
          fill="white"
        />
      </mask>
      <g mask="url(#mask2_872_3158)">
        <path
          d="M1.39502 0.00134277V15.9919H14.987V0.00134277H1.39502Z"
          fill="url(#paint2_linear_872_3158)"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_872_3158"
          x1="12.5064"
          y1="-1.23818"
          x2="3.42452"
          y2="17.2146"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.3" stopColor="#3E863D" />
          <stop offset="0.5" stopColor="#55934F" />
          <stop offset="0.8" stopColor="#5AAD45" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_872_3158"
          x1="-0.166585"
          y1="14.2083"
          x2="16.3156"
          y2="2.07868"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.57" stopColor="#3E863D" />
          <stop offset="0.72" stopColor="#619857" />
          <stop offset="1" stopColor="#76AC64" />
        </linearGradient>
        <linearGradient
          id="paint2_linear_872_3158"
          x1="1.39961"
          y1="7.99708"
          x2="14.9896"
          y2="7.99708"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.16" stopColor="#6BBF47" />
          <stop offset="0.38" stopColor="#79B461" />
          <stop offset="0.47" stopColor="#75AC64" />
          <stop offset="0.7" stopColor="#659E5A" />
          <stop offset="0.9" stopColor="#3E863D" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const NuxtIcon = ({ size = 16 }: { size?: number }) => {
  return (
    <svg
      data-testid="geist-icon"
      height={size}
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      width={size}
      style={{ color: 'currentcolor' }}
    >
      <path
        d="M8.97614 13.3333H14.924C15.1129 13.3333 15.2985 13.2841 15.4621 13.1905C15.6257 13.0968 15.7616 12.9621 15.856 12.8C15.9504 12.6378 16.0001 12.4538 16 12.2666C15.9999 12.0794 15.9501 11.8955 15.8555 11.7334L11.8611 4.87625C11.7667 4.71411 11.6309 4.57946 11.4673 4.48585C11.3037 4.39225 11.1182 4.34295 10.9293 4.34295C10.7404 4.34295 10.5549 4.39225 10.3913 4.48585C10.2277 4.57946 10.0919 4.71411 9.99751 4.87625L8.97614 6.63074L6.97922 3.19987C6.88473 3.03776 6.74885 2.90313 6.58524 2.80953C6.42162 2.71594 6.23604 2.66666 6.04713 2.66666C5.85822 2.66666 5.67264 2.71594 5.50903 2.80953C5.3454 2.90313 5.20953 3.03776 5.11504 3.19987L0.144471 11.7334C0.0499099 11.8955 8.22996e-05 12.0794 1.01863e-07 12.2666C-8.20958e-05 12.4538 0.0495838 12.6378 0.144003 12.8C0.238421 12.9621 0.374263 13.0968 0.537867 13.1905C0.701468 13.2841 0.887063 13.3333 1.07598 13.3333H4.80956C6.28885 13.3333 7.37977 12.6893 8.13042 11.4329L9.95287 8.3048L10.929 6.63074L13.8586 11.6593H9.95287L8.97614 13.3333ZM4.74869 11.6575L2.14313 11.657L6.04887 4.95264L7.99769 8.3048L6.69287 10.5453C6.19436 11.3605 5.62804 11.6575 4.74869 11.6575Z"
        fill="#00DC82"
      />
    </svg>
  );
};

export const LogoExpo = ({ size = 48 }: { size?: number }) => {
  return (
    <svg
      data-testid="geist-icon"
      width={size}
      height={size}
      viewBox="0 0 24 22"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: 'currentcolor' }}
    >
      <path
        d="M11.39 8.269c.19-.277.397-.312.565-.312.168 0 .447.035.637.312 1.49 2.03 3.95 6.075 5.765 9.06 1.184 1.945 2.093 3.44 2.28 3.63.7.714 1.66.269 2.218-.541.549-.797.701-1.357.701-1.954 0-.407-7.958-15.087-8.759-16.309C14.027.98 13.775.683 12.457.683h-.988c-1.315 0-1.505.297-2.276 1.472C8.392 3.377.433 18.057.433 18.463c0 .598.153 1.158.703 1.955.558.81 1.518 1.255 2.218.54.186-.19 1.095-1.684 2.279-3.63 1.815-2.984 4.267-7.029 5.758-9.06z"
        fill="currentColor"
      />
    </svg>
  );
};

export const PuzzleIcon = ({ size = 16 }: { size?: number }) => {
  return (
    <svg
      data-testid="geist-icon"
      height={size}
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      width={size}
      style={{ color: 'currentcolor' }}
    >
      <path
        d="M12.25 14.25V10L12.9212 10.1119C14.1403 10.315 15.25 9.37496 15.25 8.13908V7.86092C15.25 6.62504 14.1403 5.68496 12.9212 5.88813L12.25 6V1.75H8.235L8.30764 2.50382C8.41075 3.57386 7.56957 4.5 6.49457 4.5C5.42349 4.5 4.58361 3.58031 4.68058 2.51362L4.75 1.75H0.75V14.25H12.25Z"
        stroke="currentColor"
        fill="transparent"
        strokeWidth="1.5"
      />
    </svg>
  );
};
