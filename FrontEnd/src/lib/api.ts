// src/lib/api.ts
import { mockHouses, mockDevices, SwiftletHouse, DeviceItem } from '../data/mockData';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const houseApi = {
  getHouses: async (): Promise<SwiftletHouse[]> => {
    try {
      // Khi chưa có Backend thật, trả về dữ liệu mẫu (Mock JSON)
      if (!process.env.NEXT_PUBLIC_USE_REAL_API) {
        return mockHouses;
      }
      const res = await fetch(`${API_BASE_URL}/houses`);
      if (!res.ok) throw new Error('Failed to fetch');
      return await res.json();
    } catch (error) {
      console.warn('Dùng dữ liệu mẫu (mock data) cho nhà yến:', error);
      return mockHouses;
    }
  },

  getDevices: async (): Promise<DeviceItem[]> => {
    try {
      if (!process.env.NEXT_PUBLIC_USE_REAL_API) {
        return mockDevices;
      }
      const res = await fetch(`${API_BASE_URL}/devices`);
      if (!res.ok) throw new Error('Failed to fetch devices');
      return await res.json();
    } catch (error) {
      console.warn('Dùng dữ liệu mẫu cho thiết bị:', error);
      return mockDevices;
    }
  },
};