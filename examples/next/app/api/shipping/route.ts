import { NextResponse } from 'next/server';

type ShippingRate = {
  carrierCode: string;
  shippingService: string;
  discountedPrice: string[];
};

type Dimensions = {
  length: number;
  width: number;
  height: number;
};

const EBAY_API_ENDPOINT = 'https://www.ebay.com/shp/calc/api/shipping/services';

const estimateTotalWeight = (
  itemWeightLbs: number,
  itemWeightOz: number,
  { length, width, height }: Dimensions,
) => {
  const volumeCubicFt = (length * width * height) / 1728;
  const boxWeightLbs = 0.8 * volumeCubicFt;
  const totalWeightLbs = itemWeightLbs + itemWeightOz / 16 + boxWeightLbs;
  const major = Math.floor(totalWeightLbs);
  const minor = Math.round((totalWeightLbs - major) * 16);

  return { major, minor };
};

const getShippingRates = async (
  weightLbs: number,
  weightOz: number,
  sellerZip: string,
  buyerZip: string,
  { length, width, height }: Dimensions,
) => {
  const payload = {
    package: {
      dimensions: {
        length: String(length),
        width: String(width),
        height: String(height),
      },
      weight: {
        major: String(weightLbs),
        minor: String(weightOz),
      },
      location: {
        from: {
          country: 'US',
          zip: sellerZip,
        },
        to: {
          country: 'US',
          zip: buyerZip,
        },
      },
      unitSystem: 'IMPERIAL',
    },
  };

  const response = await fetch(EBAY_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch shipping rates.');
  }

  const data = (await response.json()) as ShippingRate[];

  const filteredRates = data.filter(
    rate =>
      !rate.shippingService.includes('One Rate') &&
      !rate.shippingService.includes('Flat Rate') &&
      !rate.shippingService.includes('Media Mail') &&
      rate.discountedPrice?.length,
  );

  return filteredRates.sort(
    (left, right) =>
      Number.parseFloat(left.discountedPrice[0]) -
      Number.parseFloat(right.discountedPrice[0]),
  );
};

const analyzeCostSavings = async (
  weightLbs: number,
  weightOz: number,
  sellerZip: string,
  buyerZip: string,
  dimensions: Dimensions,
) => {
  const adjustedWeight = estimateTotalWeight(weightLbs, weightOz, dimensions);
  const originalRates = await getShippingRates(
    adjustedWeight.major,
    adjustedWeight.minor,
    sellerZip,
    buyerZip,
    dimensions,
  );

  const top5Avg =
    originalRates.reduce(
      (sum, rate, index) =>
        index < 5 ? sum + Number.parseFloat(rate.discountedPrice[0]) : sum,
      0,
    ) / Math.min(5, originalRates.length);

  const savings: Array<{
    dimension: keyof Dimensions;
    reduction: number;
    service: string;
    savings: number;
    newCost: number;
  }> = [];

  const dimensionKeys: Array<keyof Dimensions> = ['length', 'width', 'height'];

  for (const dimension of dimensionKeys) {
    for (const reduction of [1, 2]) {
      const newDimensions: Dimensions = {
        ...dimensions,
        [dimension]: dimensions[dimension] - reduction,
      };

      if (newDimensions[dimension] <= 0) {
        continue;
      }

      const newWeight = estimateTotalWeight(weightLbs, weightOz, newDimensions);
      const newRates = await getShippingRates(
        newWeight.major,
        newWeight.minor,
        sellerZip,
        buyerZip,
        newDimensions,
      );

      const originalCosts = new Map(
        originalRates.map(rate => [
          rate.shippingService,
          Number.parseFloat(rate.discountedPrice[0]),
        ]),
      );
      const newCosts = new Map(
        newRates
          .filter(rate => Number.parseFloat(rate.discountedPrice[0]) < top5Avg)
          .map(rate => [
            rate.shippingService,
            Number.parseFloat(rate.discountedPrice[0]),
          ]),
      );

      for (const [service, originalCost] of originalCosts.entries()) {
        const newCost = newCosts.get(service);

        if (newCost !== undefined && newCost < originalCost) {
          savings.push({
            dimension,
            reduction,
            service,
            savings: originalCost - newCost,
            newCost,
          });
        }
      }
    }
  }

  savings.sort((left, right) => left.newCost - right.newCost);

  return { originalRates, savings };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sellerZip: string;
      buyerZip: string;
      weightLbs: number;
      weightOz: number;
      length: number;
      width: number;
      height: number;
    };

    const { originalRates, savings } = await analyzeCostSavings(
      body.weightLbs,
      body.weightOz,
      body.sellerZip,
      body.buyerZip,
      {
        length: body.length,
        width: body.width,
        height: body.height,
      },
    );

    return NextResponse.json({ originalRates, savings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
