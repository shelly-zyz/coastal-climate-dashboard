import type { Metadata } from "next";
import "./globals.css";
import "./insights.css";

export const metadata: Metadata = {
  title: "中国沿海气象可视化大屏",
  description: "MPI-ESM1-2-HR SSP2-4.5，2021-2030 年中国沿海气象特征分析",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
