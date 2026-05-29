export interface CompanyProfile {
  id?: number;
  nome_empresa: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  /** Texto completo (gerado automaticamente na gravação) */
  endereco: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  telefone: string;
  email?: string;
  cep?: string;
  logo_base64?: string;
}

export interface CatalogItem {
  id?: number;
  nome?: string;
  placa?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cnpj_cpf?: string;
  cpf?: string;
  telefone?: string;
  inscricao_estadual?: string;
  /** Caminhão habitual do motorista */
  vehicle_id?: number | null;
  /** Agente habitual (nome vindo do cadastro) */
  agente_id?: number | null;
  agente_nome?: string;
}

/** Payload ao cadastrar motorista + veículo no mesmo formulário */
export interface DriverSavePayload {
  id?: number;
  nome: string;
  cpf?: string;
  telefone?: string;
  vehicle_link: "new" | "existing" | "none";
  vehicle_id?: number;
  placa?: string;
  cidade?: string;
  estado?: string;
  agente_id?: number;
}

export interface Receipt {
  id?: number;
  company_id?: number;
  numero_recibo: string;
  data_recibo: string;
  has_qrcode?: boolean;
  has_signature?: boolean;
  is_blank?: boolean;
  
  // Sender
  remetente_nome: string;
  remetente_endereco: string;
  remetente_cidade: string;
  remetente_estado: string;
  remetente_cnpj_cpf: string;
  remetente_inscricao_estadual: string;
  
  // Recipient
  destinatario_nome: string;
  destinatario_endereco: string;
  destinatario_cidade: string;
  destinatario_estado: string;
  destinatario_cnpj_cpf: string;
  destinatario_inscricao_estadual: string;
  
  // Goods (Mercadoria)
  mercadoria_natureza: string;
  mercadoria_documento_fiscal?: string;
  mercadoria_nota_fiscal: string;
  mercadoria_valor: string | number;
  mercadoria_quantidade: string | number;
  mercadoria_peso?: string | number;
  mercadoria_unidade: string;
  
  // Values (Valores)
  valor_seguro: string | number;
  valor_icms: string | number;
  valor_outros: string | number;
  valor_total_frete: string | number;
  observacoes: string;
  
  // Carrier (Transportador)
  motorista_nome: string;
  motorista_cpf: string;
  motorista_telefone: string;
  veiculo_placa: string;
  veiculo_cidade: string;
  veiculo_estado: string;
  fatura_nome?: string;
  agente_nome?: string;
  created_at?: string;
}

export type ActiveTab = "history" | "form" | "company" | "catalogs" | "account";
