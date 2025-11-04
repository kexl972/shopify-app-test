import qrcode from "qrcode";
import invariant from "tiny-invariant";
import db from "../db.server";

export async function getQRCode(id, graphql) {
  const qrCode = await db.qRCode.findFirst({ where: { id } });

  if (!qrCode) {
    return null;
  }

  return await supplementQRCode(qrCode, graphql);
}


export async function getQRCodes(shop, graphql) {
  const qrCodes = await db.qRCode.findMany({
    where: { shop },
    orderBy: { id: "desc" },
  });

  if (qrCodes.length === 0) return [];

  return Promise.all(
    qrCodes.map((qrCode) => supplementQRCode(qrCode, graphql))
  );
}

export function getQRCodeImage(id) {
  const url = new URL(`/qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
  return qrcode.toDataURL(url.href);
}

export function getDestinationUrl(qrCode) {
  if (qrCode.destination === "product") {
    return `https://${qrCode.shop}/products/${qrCode.productHandle}`;
  }

  const match = /gid:\/\/shopify\/ProductVariant\/([0-9]+)/.exec(qrCode.productVariantId);
  invariant(match, "Unrecognized product variant ID");

  return `https://${qrCode.shop}/cart/${match[1]}:1`;
}


async function supplementQRCode(qrCode, graphql) {
  const qrCodeImagePromise = getQRCodeImage(qrCode.id);

  const response = await graphql(
    `
      query supplementQRCode($id: ID!) {
        product(id: $id) {
          title
          media(first: 1) {
            nodes {
              preview {
                image {
                  altText
                  url
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        id: qrCode.productId,
      },
    }
  );

  const {
    data: { product },
  } = await response.json();

return {
    ...qrCode,
    productDeleted: !product?.title,
    productTitle: product?.title,
    productImage: product?.media?.nodes[0]?.preview?.image?.url,
    productAlt: product?.media?.nodes[0]?.preview?.image?.altText,
    destinationUrl: getDestinationUrl(qrCode),
    image: await qrCodeImagePromise,
  };
}

export async function validateQRCode(data) {
  const errors = {};

  if (!data.title) {
    errors.title = "Title is required";
  }

  if (!data.productId) {
    errors.productId = "Product is required";
  }

  if (!data.destination) {
    errors.destination = "Destination is required";
  }

  if (Object.keys(errors).length) {
    return errors;
  }
}

export async function createQRCode(data, graphql) {
  const response = await graphql(
    `
      query getProduct($id: ID!) {
        product(id: $id) {
          handle
        }
      }
    `,
    {
      variables: {
        id: data.productId,
      },
    }
  );

  const {
    data: { product },
  } = await response.json();

  const qrCode = await db.qRCode.create({
    data: {
      title: data.title,
      shop: data.shop,
      productId: data.productId,
      productHandle: product.handle,
      productVariantId: data.productVariantId,
      destination: data.destination,
    },
  });

  return qrCode;
}

export async function updateQRCode(id, data, graphql) {
  const qrCode = await db.qRCode.findFirst({ where: { id } });

  if (!qrCode) {
    return null;
  }

  const response = await graphql(
    `
      query getProduct($id: ID!) {
        product(id: $id) {
          handle
        }
      }
    `,
    {
      variables: {
        id: data.productId,
      },
    }
  );

  const {
    data: { product },
  } = await response.json();

  return await db.qRCode.update({
    where: { id },
    data: {
      title: data.title,
      productId: data.productId,
      productHandle: product.handle,
      productVariantId: data.productVariantId,
      destination: data.destination,
    },
  });
}

export async function deleteQRCode(id) {
  return await db.qRCode.delete({ where: { id } });
}