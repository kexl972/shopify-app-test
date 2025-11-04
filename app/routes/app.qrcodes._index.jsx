import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getQRCodes } from "../models/QRCode.server";

export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    const qrCodes = await getQRCodes(session.shop, admin.graphql);
    
    return qrCodes;
  } catch (error) {
    // 如果认证失败，返回空数组避免阻塞
    return [];
  }
};

export default function Index() {
  const qrCodes = useLoaderData();
  const fetcher = useFetcher();

  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const qrCodesMarkup = qrCodes.length ? (
    <s-table>
      <s-table-header>
        <s-table-row>
          <s-table-header-cell>Title</s-table-header-cell>
          <s-table-header-cell>Product</s-table-header-cell>
          <s-table-header-cell>Date created</s-table-header-cell>
          <s-table-header-cell>QR code</s-table-header-cell>
          <s-table-header-cell>Scans</s-table-header-cell>
          <s-table-header-cell>Actions</s-table-header-cell>
        </s-table-row>
      </s-table-header>
      <s-table-body>
        {qrCodes.map(
          ({
            id,
            title,
            productImage,
            productTitle,
            createdAt,
            image,
            scans,
          }) => (
            <s-table-row key={id}>
              <s-table-cell>
                <s-link to={`qrcodes/${id}`}>{title}</s-link>
              </s-table-cell>
              <s-table-cell>
                <s-stack direction="inline" gap="tight">
                  {productImage && (
                    <img
                      src={productImage}
                      alt={productTitle}
                      style={{ width: "30px", height: "30px" }}
                    />
                  )}
                  <span>{productTitle}</span>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                {new Date(createdAt).toDateString()}
              </s-table-cell>
              <s-table-cell>
                <img src={image} alt={`QR code for ${title}`} style={{ width: "50px" }} />
              </s-table-cell>
              <s-table-cell>{scans}</s-table-cell>
              <s-table-cell>
                <s-button-group>
                  <s-button to={`qrcodes/${id}`} size="micro">
                    View
                  </s-button>
                  <s-button
                    onClick={() => {
                      fetcher.submit(
                        { id },
                        { method: "DELETE", action: `/app/qrcodes/${id}` }
                      );
                    }}
                    variant="tertiary"
                    tone="critical"
                    size="micro"
                    {...(isLoading ? { loading: true } : {})}
                  >
                    Delete
                  </s-button>
                </s-button-group>
              </s-table-cell>
            </s-table-row>
          )
        )}
      </s-table-body>
    </s-table>
  ) : (
    <s-empty-state
      heading="Create unique QR codes for your product"
      action={{
        content: "Create QR code",
        to: "qrcodes/new",
      }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Allow customers to scan codes and buy products using their phones.</p>
    </s-empty-state>
  );

  return (
    <s-page
      heading="QR codes"
      primaryAction={{
        content: "Create QR code",
        to: "qrcodes/new",
      }}
    >
      <s-section>
        <s-card>
          {qrCodesMarkup}
        </s-card>
      </s-section>
    </s-page>
  );
}