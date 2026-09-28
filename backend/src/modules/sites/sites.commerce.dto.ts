import { z } from 'zod';
import { httpUrl } from '../../utils/url';
import { PAGE_SLUG_PATTERN } from './sites.logic';
import { id, optionalText, optionalUrl, pagination } from './sites.dto';

// =============================================================================
// Website Builder v2 — commerce DTOs (products, orders, customers, checkout,
// customer account). Same conventions as sites.dto.ts.
// =============================================================================

const email = z.string().trim().toLowerCase().email().max(200);
const money = (max = 10_000_000) => z.coerce.number().nonnegative().max(max);
const optionalMoney = (max = 10_000_000) =>
  z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nonnegative().max(max).nullable().optional());

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(PAGE_SLUG_PATTERN, 'Use lowercase letters, digits and hyphens');

// ── Admin: products ──────────────────────────────────────────────────────────

export const ProductQueryDto = z.object({
  ...pagination,
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
});

export const CreateProductDto = z.object({
  slug: slug.optional(),
  name: z.string().trim().min(1).max(200),
  nameBn: optionalText(200),
  // Sanitised (sanitizeHtml) in sites.commerce.service.ts; may be ''.
  description: z.string().max(20_000).default(''),
  images: z.array(httpUrl()).max(20).default([]),
  price: money(),
  compareAtPrice: optionalMoney(),
  sku: optionalText(60),
  stock: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nonnegative().max(1_000_000).nullable().optional()),
  category: optionalText(80),
  kind: z.enum(['PHYSICAL', 'DIGITAL']).default('PHYSICAL'),
  digitalUrl: optionalUrl,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export const UpdateProductDto = CreateProductDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ── Admin: orders ────────────────────────────────────────────────────────────

const orderStatus = z.enum(['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED']);

export const OrderQueryDto = z.object({
  ...pagination,
  status: orderStatus.optional(),
  q: z.string().trim().max(100).optional(),
});

export const UpdateOrderDto = z
  .object({
    status: orderStatus.optional(),
    adminNote: optionalText(2000),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, { message: 'Nothing to update' });

// ── Admin: customers ─────────────────────────────────────────────────────────

export const CustomerQueryDto = z.object({ ...pagination, q: z.string().trim().max(100).optional() });

// ── Public: catalogue ────────────────────────────────────────────────────────

export const PublicProductQueryDto = z.object({
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  preview: z.string().max(2000).optional(),
});

export const PublicProductParamDto = z.object({ siteId: id, slug: z.string().trim().toLowerCase().max(100) });

// ── Public: customer account ─────────────────────────────────────────────────

export const RegisterCustomerDto = z.object({
  name: z.string().trim().min(1).max(150),
  email,
  password: z.string().min(8).max(200),
  phone: optionalText(30),
});

export const LoginCustomerDto = z.object({
  email,
  password: z.string().min(1).max(200),
});

// ── Public: orders + payment ─────────────────────────────────────────────────

const cartItemKind = z.enum(['PRODUCT', 'COURSE']);
const CartItemDto = z.object({
  kind: cartItemKind,
  refId: id,
  qty: z.coerce.number().int().positive().max(99).default(1),
});

const AddressDto = z
  .object({
    line1: z.string().trim().min(1).max(300),
    city: z.string().trim().min(1).max(120),
    area: optionalText(120),
    postcode: optionalText(20),
  })
  .optional();

export const CreateOrderDto = z.object({
  items: z.array(CartItemDto).min(1).max(50),
  customer: z.object({
    name: z.string().trim().min(1).max(150),
    email,
    phone: z.string().trim().min(3).max(30),
    address: AddressDto,
  }),
  paymentMethod: z.enum(['COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ']),
  note: optionalText(1000),
  returnUrl: z.string().trim().max(2000).optional(),
});

export const PublicOrderParamDto = z.object({ siteId: id, orderNo: z.string().trim().max(40) });
export const PublicOrderQueryDto = z.object({ email: email.optional() });

export const DemoPayDto = z.object({
  email,
  outcome: z.enum(['success', 'fail']),
});

export const PayCallbackParamDto = z.object({
  gateway: z.string().trim().toLowerCase().max(20),
  kind: z.enum(['ipn', 'success', 'fail', 'cancel', 'callback']),
});

export type ProductQueryDtoType = z.infer<typeof ProductQueryDto>;
export type CreateProductDtoType = z.infer<typeof CreateProductDto>;
export type UpdateProductDtoType = z.infer<typeof UpdateProductDto>;
export type OrderQueryDtoType = z.infer<typeof OrderQueryDto>;
export type UpdateOrderDtoType = z.infer<typeof UpdateOrderDto>;
export type CustomerQueryDtoType = z.infer<typeof CustomerQueryDto>;
export type PublicProductQueryDtoType = z.infer<typeof PublicProductQueryDto>;
export type RegisterCustomerDtoType = z.infer<typeof RegisterCustomerDto>;
export type LoginCustomerDtoType = z.infer<typeof LoginCustomerDto>;
export type CreateOrderDtoType = z.infer<typeof CreateOrderDto>;
export type DemoPayDtoType = z.infer<typeof DemoPayDto>;
