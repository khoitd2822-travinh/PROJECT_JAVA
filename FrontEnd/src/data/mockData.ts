// src/data/mockData.ts

export interface SwiftletHouse {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'warning' | 'offline';
  temperature: number; // °C
  humidity: number;    // %
  co2: number;         // ppm
  light: number;       // Lux (Ánh sáng)
  birdsInToday: number;
  birdsOutToday: number;
  mistingActive: boolean;
}

export interface DeviceItem {
  id: string;
  name: string;
  description: string;
  on: boolean;
  type: 'misting' | 'fan' | 'heater' | 'sound';
}

export interface AlertItem {
  id: string;
  type: 'warning' | 'success' | 'danger';
  title: string;
  message: string;
  time: string;
}

// Dữ liệu danh sách nhà yến & vi khí hậu (Nhiệt độ, Độ ẩm, Khí CO2, Ánh sáng)
export const mockHouses: SwiftletHouse[] = [
  {
    id: 'house-01',
    name: 'Nhà yến Lâm Sơn - Tầng 1',
    location: 'Lâm Sơn, Ninh Thuận',
    status: 'online',
    temperature: 28.4,
    humidity: 82.5,
    co2: 650,
    light: 120,
    birdsInToday: 1240,
    birdsOutToday: 1190,
    mistingActive: true,
  },
  {
    id: 'house-02',
    name: 'Nhà yến Lâm Sơn - Tầng 2',
    location: 'Lâm Sơn, Ninh Thuận',
    status: 'online',
    temperature: 31.8,
    humidity: 71.0,
    co2: 820,
    light: 180,
    birdsInToday: 850,
    birdsOutToday: 880,
    mistingActive: true,
  },
];

// Dữ liệu thiết bị phần cứng trong nhà yến
export const mockDevices: DeviceItem[] = [
  { id: 'dev-01', name: 'Misting System', description: 'Hệ thống phun sương kiểm soát độ ẩm', on: true, type: 'misting' },
  { id: 'dev-02', name: 'Ventilation Fan', description: 'Quạt thông gió lưu thông không khí', on: true, type: 'fan' },
  { id: 'dev-03', name: 'Heater', description: 'Đèn sưởi điều chỉnh nhiệt độ', on: false, type: 'heater' },
  { id: 'dev-04', name: 'Bird Sound System', description: 'Hệ thống âm thanh gọi yến', on: true, type: 'sound' },
];

// Lịch sử cảnh báo mẫu
export const mockAlerts: AlertItem[] = [
  {
    id: 'alt-01',
    type: 'warning',
    title: 'Độ ẩm xuống thấp',
    message: 'Độ ẩm tại nhà yến 02 giảm còn 71.0%, dưới mức an toàn (75%).',
    time: '10:42 AM',
  },
  {
    id: 'alt-02',
    type: 'success',
    title: 'Hệ thống kết nối ổn định',
    message: 'Tất cả cảm biến ESP32 đã gửi dữ liệu telemetry qua MQTT thành công.',
    time: '09:15 AM',
  },
];