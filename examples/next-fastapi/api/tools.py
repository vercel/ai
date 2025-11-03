
import random


def get_current_weather(location, unit="fahrenheit"):
    print(f"TOOL CALL : Getting weather for {location} in {unit}")
    if unit == "celsius":
        temperature = random.randint(-34, 43)
    else:
        temperature = random.randint(-30, 110)

    return {
        "temperature": temperature,
        "unit": unit,
        "location": location,
    }