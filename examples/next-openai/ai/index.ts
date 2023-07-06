import { FunctionCallHandler } from "ai";
import getCurrentWeather from "./get_current_weather";
import getClientLocation from "./get_client_location";
import getServerLocation from "./get_server_location";

export const functionCallHandler: FunctionCallHandler = async (
  chatMessages,
  functionCall
) => {
  if (functionCall.name === "get_current_weather") {
    return getCurrentWeather(chatMessages, functionCall);
  } else if (functionCall.name === "get_server_location") {
    return getServerLocation(chatMessages);
  } else if (functionCall.name === "get_client_location") {
    return getClientLocation(chatMessages);
  }
};
