export type Category =
  | "WHISKY" | "BEER" | "RUM" | "VODKA" | "WINE"
  | "BRANDY" | "GIN" | "RTD" | "OTHER";

export interface Product {
  id: string;
  name: string;
  category: Category;
  packSizeMl: number | null;
  mrp: number;
}

export interface Shop {
  id: string;
  name: string;
  area: string;
  address: string;
  licenceNo: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  rating: number;
  hours: { open: string; close: string };
  status: "ACTIVE" | "PAUSED";
}

export interface CatalogItem {
  productId: string;
  price: number;
  stock: number;
  soldQty: number; // units sold in the register day — powers "top movers"
  isVisible: boolean;
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  area: string;
  lat: number;
  lng: number;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  ageVerified: boolean;
  addresses: Address[];
}

export interface Rider {
  id: string;
  name: string;
  mobile: string;
  vehicleNo: string;
}

export type OrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "SUBSTITUTION_PENDING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED"
  | "VERIFICATION_FAILED";

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  substitutedFrom?: string; // original product name if this item replaced one
}

export interface OrderEvent {
  type: string;
  at: string;
  note?: string;
}

export interface SubstitutionProposal {
  itemIndex: number;
  productId: string;
  name: string;
  unitPrice: number;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  shopId: string;
  addressId: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  convenienceFee: number;
  total: number;
  status: OrderStatus;
  otp: string;
  riderId: string | null;
  packing: { picked: boolean; packed: boolean; sealed: boolean };
  substitution: SubstitutionProposal | null;
  createdAt: string;
  events: OrderEvent[];
}

export interface StateConfig {
  state: string;
  city: string;
  legalAge: number;
  deliveryWindow: { open: string; close: string };
  dryDay: boolean;
  windowOverride: boolean; // demo escape hatch for out-of-window testing
  commissionPct: number;
  deliveryFee: number;
  convenienceFee: number;
}

export interface Db {
  products: Product[];
  shops: Shop[];
  catalogs: Record<string, CatalogItem[]>;
  customers: Customer[];
  riders: Rider[];
  orders: Order[];
  stateConfig: StateConfig;
}

/** Catalog item joined with its product, as served to clients. */
export interface CatalogEntry extends Product {
  price: number;
  stock: number;
  soldQty: number;
}
