import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2f6b3b",
        }}
      >
        <svg width="140" height="140" viewBox="0 0 32 32">
          <path d="M16 25v-9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 17c0-4.5 3-7.5 8-7.5 0 4.6-3.2 7.5-8 7.5Z" fill="#f2b33d" />
          <path d="M16 19.5c0-3.6-2.4-6-6.5-6 0 3.7 2.6 6 6.5 6Z" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
