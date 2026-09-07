import { ImageResponse } from "next/og";
import { BASE_BLUE } from "@/components/Logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BASE_BLUE,
          borderRadius: 9,
          color: "white",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        B
      </div>
    ),
    size
  );
}
