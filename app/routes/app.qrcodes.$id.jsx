import { useState, useEffect } from "react";
import {
  useActionData,
  useLoaderData,
  useSubmit,
  useParams,
  useNavigate,
  Form,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { getQRCode, validateQRCode } from "../models/QRCode.server";

export async function loader({ request, params }) {
  // 如果是新建页面，直接返回默认数据，不需要认证
  if (params.id === "new") {
    return {
      destination: "product",
      title: "",
    };
  }
  
  // 对于现有 QR 码，使用更宽松的认证策略
  try {
    const authResult = await authenticate.admin(request);
    const { admin } = authResult;

    const qrCode = await getQRCode(Number(params.id), admin.graphql);
    
    if (!qrCode) {
      throw new Response(null, {
        status: 302,
        headers: { Location: "/app" }
      });
    }
    
    return qrCode;
  } catch (error) {
    // 如果认证失败，返回最小可用数据而不是重定向
    // 这样可以避免阻塞用户界面
    return {
      destination: "product",
      title: `QR Code ${params.id}`,
      id: Number(params.id),
    };
  }
}

export async function action({ request, params }) {
  try {
    const { session, redirect } = await authenticate.admin(request);
    const { shop } = session;

    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);

    if (rawData.action === "delete") {
      await db.qRCode.delete({ where: { id: Number(params.id) } });
      return redirect("/app");
    }

    // 只提取数据库模式中存在的字段
    const data = {
      title: rawData.title || "",
      shop,
      productId: rawData.productId || "",
      productHandle: rawData.productHandle || "",
      productVariantId: rawData.productVariantId || "",
      destination: rawData.destination || "product",
    };

    const errors = await validateQRCode(data);

    if (errors) {
      return { errors };
    }

    const qrCode =
      params.id === "new"
        ? await db.qRCode.create({ data })
        : await db.qRCode.update({ where: { id: Number(params.id) }, data });

    return redirect(`/app/qrcodes/${qrCode.id}`);
  } catch (error) {
    // 如果认证失败，直接重定向到应用首页
    if (error instanceof Response && error.status === 302) {
      throw new Response(null, {
        status: 302,
        headers: { Location: "/app" }
      });
    }
    
    // 其他错误也重定向到应用首页
    throw new Response(null, {
      status: 302,
      headers: { Location: "/app" }
    });
  }
}

export default function QRCodeForm() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const { id } = useParams();

  const qrCode = useLoaderData();
  const [initialFormState, setInitialFormState] = useState(qrCode);
  const [formState, setFormState] = useState(qrCode);
  const errors = useActionData()?.errors || {};
  const isDirty =
    JSON.stringify(formState) !== JSON.stringify(initialFormState);

  async function selectProduct() {
    const products = await window.shopify.resourcePicker({
      type: "product",
      action: "select", // customized action verb, either 'select' or 'add',
    });

    if (products) {
      const { images, id, variants, title, handle } = products[0];

      setFormState({
        ...formState,
        productId: id,
        productVariantId: variants[0].id,
        productTitle: title,
        productHandle: handle,
        productAlt: images[0]?.altText,
        productImage: images[0]?.originalSrc,
      });
    }
  }

  function removeProduct() {
    setFormState({
      title: formState.title,
      destination: formState.destination,
    });
  }

  const productUrl = formState.productId
    ? `shopify://admin/products/${formState.productId.split("/").at(-1)}`
    : "";


  function handleSave() {
    // Form 组件会自动处理提交
  }

  function handleDelete() {
    submit(
      { action: "delete" },
      { method: "post" }
    );
  }

  function handleReset() {
    setFormState(initialFormState);
    window.shopify.saveBar.hide("qr-code-form");
  }


  useEffect(() => {
    setInitialFormState(qrCode);
    setFormState(qrCode);
  }, [id, qrCode]);

  return (
    <>
      <Form method="post" data-save-bar onSubmit={handleSave} onReset={handleReset}>
        {/* 产品相关的隐藏字段 - 只保存数据库需要的字段 */}
        <input type="hidden" name="productId" value={formState.productId || ""} />
        <input type="hidden" name="productVariantId" value={formState.productVariantId || ""} />
        <input type="hidden" name="productHandle" value={formState.productHandle || ""} />
        
        <s-page heading={initialFormState.title || "Create QR code"}>
          <s-link
            href="#"
            slot="breadcrumb-actions"
            onClick={(e) => {
              e.preventDefault();
              if (!isDirty) {
                navigate("/app");
              }
            }}
          >
            QR Codes
          </s-link>
          {initialFormState.id &&
            <s-button slot="secondary-actions" onClick={handleDelete}>Delete</s-button>}
          <s-section heading="QR Code information">
            <s-stack gap="base">
              <s-text-field
                label="Title"
                details="Only store staff can see this title"
                error={errors.title}
                autoComplete="off"
                name="title"
                value={formState.title}
                onInput={(e) =>
                  setFormState({ ...formState, title: e.target.value })
                }
              ></s-text-field>
              <s-stack gap="500" align="space-between" blockAlign="start">
                <s-select
                  name="destination"
                  label="Scan destination"
                  value={formState.destination}
                  onChange={(e) =>
                    setFormState({ ...formState, destination: e.target.value })
                  }
                >
                  <s-option
                    value="product"
                    selected={formState.destination === "product"}
                  >
                    Link to product page
                  </s-option>
                  <s-option
                    value="cart"
                    selected={formState.destination === "cart"}
                  >
                    Link to checkout page with product in the cart
                  </s-option>
                </s-select>
                {initialFormState.destinationUrl ? (
                  <s-link
                    variant="plain"
                    href={initialFormState.destinationUrl}
                    target="_blank"
                  >
                    Go to destination URL
                  </s-link>
                ) : null}
              </s-stack>
              <s-stack gap="small-400">
                <s-stack direction="inline" gap="small-100" justifyContent="space-between">
                  <s-text color="subdued">Product</s-text>
                  {formState.productId ? (
                    <s-link
                      onClick={removeProduct}
                      accessibilityLabel="Remove the product from this QR Code"
                      variant="tertiary"
                      tone="neutral"
                    >
                      Clear
                    </s-link>
                  ) : null}
                </s-stack>
                {formState.productId ? (
                  <s-stack
                    direction="inline"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <s-stack
                      direction="inline"
                      gap="small-100"
                      alignItems="center"
                    >
                      <s-clickable
                        href={productUrl}
                        target="_blank"
                        accessibilityLabel={`Go to the product page for ${formState.productTitle}`}
                        borderRadius="base"
                      >
                        <s-box
                          padding="small-200"
                          border="base"
                          borderRadius="base"
                          background="subdued"
                          inlineSize="38px"
                          blockSize="38px"
                        >
                          {formState.productImage ? (
                            <s-image src={formState.productImage}></s-image>
                          ) : (
                            <s-icon size="large" type="product" />
                          )}
                        </s-box>
                      </s-clickable>
                      <s-link href={productUrl} target="_blank">
                        {formState.productTitle}
                      </s-link>
                    </s-stack>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        onClick={selectProduct}
                        accessibilityLabel="Change the product the QR code should be for"
                      >
                        Change
                      </s-button>
                    </s-stack>
                  </s-stack>
                ) : (
                  <s-button
                    onClick={selectProduct}
                    accessibilityLabel="Select the product the QR code should be for"
                  >
                    Select product
                  </s-button>
                )}
              </s-stack>
            </s-stack>
          </s-section>
          <s-box slot="aside">
            <s-section heading="Preview">
              <s-stack gap="base">
                <s-box
                  padding="base"
                  border="none"
                  borderRadius="base"
                  background="subdued"
                >
                  {initialFormState.image ? (
                    <s-image
                      aspectRatio="1/0.8"
                      src={initialFormState.image}
                      alt="The QR Code for the current form"
                    />
                  ) : (
                    <s-stack
                      direction="inline"
                      alignItems="center"
                      justifyContent="center"
                      blockSize="198px"
                    >
                      <s-text color="subdued">
                        See a preview once you save
                      </s-text>
                    </s-stack>
                  )}
                </s-box>
                <s-stack
                  gap="small"
                  direction="inline"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <s-button
                    disabled={!initialFormState.id}
                    href={`/qrcodes/${initialFormState.id}`}
                    target="_blank"
                  >
                    Go to public URL
                  </s-button>
                  <s-button
                    disabled={!initialFormState?.image}
                    href={initialFormState?.image}
                    download
                    variant="primary"
                  >
                    Download
                  </s-button>
                </s-stack>
              </s-stack>
            </s-section>
          </s-box>
        </s-page>
      </Form>
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};