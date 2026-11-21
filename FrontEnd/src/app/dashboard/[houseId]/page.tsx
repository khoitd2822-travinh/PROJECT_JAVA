"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function HouseDetailPage() {
  const params = useParams<{ houseId: string }>();

  return (
    <main style={{ padding: 24 }}>
      <h1>Nhà {params.houseId}</h1>
      <p>Chi tiết cảm biến nằm ở trang chủ. Điều khiển thiết bị thật nằm ở trang control.</p>
      <Link href={`/dashboard/${params.houseId}/control`}>Mở điều khiển</Link>
    </main>
  );
}