import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000';

export const estimateRide = async (pickup, dropoff, hour, vehicleType) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/estimate-ride`, {
      pickup,
      dropoff,
      hour,
      vehicle_type: vehicleType
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching ride estimation:", error);
    throw error;
  }
};
