import { Message, nanoid } from "ai";

export default async function getClientLocation(
  chatMessages: Message[]
): Promise<{ messages: Message[] }> {
  return new Promise(resolve => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          console.log(location);
          resolve({
            messages: [
              ...chatMessages,
              {
                id: nanoid(),
                name: "get_client_location",
                role: "function" as const,
                content: JSON.stringify(location),
              },
            ],
          });
        },
        function (error) {
          console.log(error);
          resolve({
            messages: [
              ...chatMessages,
              {
                id: nanoid(),
                name: "get_client_location",
                role: "function" as const,
                content: JSON.stringify({
                  error: error.message,
                }),
              },
            ],
          });
        }
      );
    } else {
      console.log("Geolocation is not supported by this browser.");
      resolve({
        messages: [
          ...chatMessages,
          {
            id: nanoid(),
            name: "get_client_location",
            role: "function" as const,
            content: JSON.stringify({
              error: "browser does not support geolocation",
            }),
          },
        ],
      });
    }
  });
}
