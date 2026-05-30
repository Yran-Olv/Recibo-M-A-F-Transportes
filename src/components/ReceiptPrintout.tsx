import React from "react";
import { Receipt, CompanyProfile } from "../types";
import { formatBRL, formatDecimal, formatDateBR } from "../utils/format";
import { SITE_LOGO_URL } from "../constants/branding";
import { formatCompanyAddressForPrint } from "../utils/companyAddress";

interface ReceiptPrintoutProps {
  receipt: Partial<Receipt>;
  company: CompanyProfile;
  isBlank?: boolean;
  /** Só o espelho do modal de impressão deve ter id para exportar PDF */
  printRootId?: string;
}

/** Estilos do espelho — fontes maiores para leitura e impressão A4 */
const S = {
  doc: {
    fontFamily: "Arial, Helvetica, 'Segoe UI', sans-serif",
    fontSize: "13px",
    lineHeight: 1.45,
    color: "#000",
    background: "#fff",
    boxSizing: "border-box" as const,
    width: "100%",
    maxWidth: "190mm",
    margin: "0 auto",
    padding: "0",
  },
  text: { fontSize: "13px", lineHeight: 1.45 },
  textSm: { fontSize: "12px", lineHeight: 1.4 },
  cell: {
    padding: "6px 10px",
    verticalAlign: "top" as const,
    fontSize: "13px",
    lineHeight: 1.45,
  },
  cellBox: {
    padding: "7px 10px",
    verticalAlign: "middle" as const,
    border: "1px solid #000",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  borderB: { borderBottom: "1px solid #000" },
  borderR: { borderRight: "1px solid #000" },
  bold: { fontWeight: 700, color: "#000" },
  title: {
    fontWeight: 700,
    fontSize: "15px",
    textAlign: "center" as const,
    textDecoration: "underline",
    textTransform: "uppercase" as const,
    padding: "8px 10px",
    letterSpacing: "0.02em",
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: "14px",
    textDecoration: "underline",
    textTransform: "uppercase" as const,
    letterSpacing: "0.02em",
  },
  value: { fontWeight: 600, fontSize: "13.5px" },
};

const COL_4 = (
  <colgroup>
    <col style={{ width: "25%" }} />
    <col style={{ width: "25%" }} />
    <col style={{ width: "25%" }} />
    <col style={{ width: "25%" }} />
  </colgroup>
);

/** Layout ESPELHO DE FRETE / VIAGEM — A4, legível, tabelas alinhadas */
export function ReceiptPrintout({
  receipt,
  company,
  isBlank = false,
  printRootId,
}: ReceiptPrintoutProps) {
  const v = (val: unknown, fallback = "") => {
    if (isBlank) return "\u00A0";
    return val !== undefined && val !== null && String(val).trim() !== ""
      ? String(val)
      : fallback;
  };

  const razao = company.nome_empresa?.trim() || "";
  const fantasia = company.nome_fantasia?.trim() || "";
  const companyName = (() => {
    if (!razao) return fantasia.toUpperCase();
    if (!fantasia || fantasia.toUpperCase() === razao.toUpperCase()) return razao.toUpperCase();
    return `${razao.toUpperCase()} — ${fantasia.toUpperCase()}`;
  })();

  const addressLines = formatCompanyAddressForPrint(company);

  const obsText =
    !isBlank &&
    (receipt.observacoes?.trim() ||
      (receipt.mercadoria_nota_fiscal ? `NF ${receipt.mercadoria_nota_fiscal}` : ""));

  const faturaNome = isBlank ? "" : receipt.fatura_nome?.trim() || "";
  const agenteNome = isBlank ? "" : receipt.agente_nome?.trim() || "";

  const logoSrc = company.logo_base64 || SITE_LOGO_URL;

  return (
    <div
      {...(printRootId ? { id: printRootId } : {})}
      className="receipt-a4 receipt-print-root"
      style={S.doc}
    >
      {/* Cabeçalho */}
      <table
        className="receipt-table"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}
        cellPadding={0}
        cellSpacing={0}
      >
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "76%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td
              rowSpan={2}
              style={{
                ...S.cell,
                borderRight: "1px solid #000",
                verticalAlign: "middle",
                textAlign: "center",
                padding: "8px 6px",
              }}
            >
              <img
                src={logoSrc}
                alt="Logo"
                className="receipt-logo"
                style={{
                  maxWidth: "100%",
                  width: "auto",
                  maxHeight: "82px",
                  minHeight: "58px",
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </td>
            <td style={{ ...S.cell, paddingBottom: "6px" }}>
              <div style={{ ...S.bold, fontSize: "14px", lineHeight: 1.3, marginBottom: "4px" }}>
                {companyName}
              </div>
              {addressLines.line1 ? (
                <div style={{ ...S.textSm, marginBottom: "2px" }}>{addressLines.line1}</div>
              ) : null}
              {addressLines.line2 ? (
                <div style={{ ...S.textSm, marginBottom: "4px" }}>{addressLines.line2}</div>
              ) : null}
              <table style={{ width: "100%", ...S.textSm }} cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ width: "55%", paddingRight: "8px" }}>
                      <span style={S.bold}>CNPJ:</span> {v(company.cnpj)}
                    </td>
                    <td style={{ width: "45%" }}>
                      <span style={S.bold}>Insc. Est.:</span> {v(company.inscricao_estadual)}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span style={S.bold}>Fone:</span> {v(company.telefone)}
                    </td>
                    <td>
                      <span style={S.bold}>E-mail:</span> {v(company.email)}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span style={S.bold}>Número:</span>{" "}
                      <span style={S.value}>{v(receipt.numero_recibo, "—")}</span>
                    </td>
                    <td>
                      <span style={S.bold}>Data:</span>{" "}
                      <span style={S.value}>{formatDateBR(receipt.data_recibo, isBlank)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={S.title}>ESPELHO DE FRETE / VIAGEM</td>
          </tr>
        </tbody>
      </table>

      {/* Remetente | Destinatário */}
      <table
        className="receipt-table"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}
      >
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ ...S.cell, ...S.borderR }}>
              <Field label="Remetente:" value={v(receipt.remetente_nome)} isBlank={isBlank} />
              <Field label="Endereço:" value={v(receipt.remetente_endereco)} isBlank={isBlank} />
              <LinePair
                leftLabel="Cidade:"
                leftValue={v(receipt.remetente_cidade)}
                rightLabel="UF:"
                rightValue={v(receipt.remetente_estado)}
              />
              <Field label="CNPJ / CPF:" value={v(receipt.remetente_cnpj_cpf)} isBlank={isBlank} />
            </td>
            <td style={S.cell}>
              <Field label="Destinatário:" value={v(receipt.destinatario_nome)} isBlank={isBlank} />
              <Field label="Endereço:" value={v(receipt.destinatario_endereco)} isBlank={isBlank} />
              <LinePair
                leftLabel="Cidade:"
                leftValue={v(receipt.destinatario_cidade)}
                rightLabel="UF:"
                rightValue={v(receipt.destinatario_estado)}
              />
              <Field label="CNPJ / CPF:" value={v(receipt.destinatario_cnpj_cpf)} isBlank={isBlank} />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...S.cell, ...S.borderB, ...S.text, paddingTop: "7px", paddingBottom: "7px" }}>
        <span style={S.bold}>Obs.:</span> {obsText || "\u00A0"}
      </div>

      {/* Mercadoria — grade 4 colunas alinhadas */}
      <table
        className="receipt-table receipt-table-mercadoria"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
      >
        {COL_4}
        <tbody>
          <tr>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.sectionTitle}>Mercadoria Transportada</span>
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.bold}>Documento Fiscal:</span>{" "}
              <span style={S.value}>{v(receipt.mercadoria_documento_fiscal)}</span>
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.bold}>Mercadoria:</span>{" "}
              <span style={S.value}>{v(receipt.mercadoria_natureza)}</span>
            </td>
          </tr>
          <tr>
            <td style={S.cellBox}>
              <span style={S.bold}>Quantidade:</span>
              <div style={S.value}>{formatDecimal(receipt.mercadoria_quantidade, isBlank, 2)}</div>
            </td>
            <td style={S.cellBox}>
              <span style={S.bold}>Peso:</span>
              <div style={S.value}>{formatDecimal(receipt.mercadoria_peso, isBlank, 2)}</div>
            </td>
            <td colSpan={2} style={S.cellBox}>
              <span style={S.bold}>Valor da Mercadoria:</span>
              <div style={S.value}>{formatBRL(receipt.mercadoria_valor, isBlank)}</div>
            </td>
          </tr>
          <tr>
            <td style={S.cellBox}>
              <span style={S.bold}>Valor ICMS:</span>
              <div style={S.value}>{formatBRL(receipt.valor_icms, isBlank)}</div>
            </td>
            <td style={S.cellBox}>
              <span style={S.bold}>Valor Seguro:</span>
              <div style={S.value}>{formatBRL(receipt.valor_seguro, isBlank)}</div>
            </td>
            <td style={S.cellBox}>
              <span style={S.bold}>Outros Valores:</span>
              <div style={S.value}>{formatBRL(receipt.valor_outros, isBlank)}</div>
            </td>
            <td style={S.cellBox}>
              <span style={S.bold}>Total:</span>
              <div style={{ ...S.value, fontSize: "14px" }}>{formatBRL(receipt.valor_total_frete, isBlank)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Veículo / motorista — mesma estrutura de duas colunas */}
      <table
        className="receipt-table"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}
      >
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} style={S.cellBox}>
              <span style={S.sectionTitle}>Veículo</span>
            </td>
          </tr>
          <tr>
            <td style={{ ...S.cellBox, ...S.borderR }}>
              <Field label="Motorista:" value={v(receipt.motorista_nome)} isBlank={isBlank} />
              <Field label="CPF:" value={v(receipt.motorista_cpf)} isBlank={isBlank} />
              <LinePair
                leftLabel="Placa:"
                leftValue={v(receipt.veiculo_placa)}
                rightLabel="UF:"
                rightValue={v(receipt.veiculo_estado)}
              />
            </td>
            <td style={S.cellBox}>
              <Field label="Fatura:" value={v(faturaNome)} isBlank={isBlank} />
              <Field label="Agente:" value={v(agenteNome)} isBlank={isBlank} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  value,
  isBlank,
}: {
  label: string;
  value: string;
  isBlank?: boolean;
}) {
  return (
    <div style={{ marginBottom: "5px", ...S.text, wordBreak: "break-word" }}>
      <span style={S.bold}>{label}</span>{" "}
      {isBlank && !value.trim() ? (
        <span style={{ borderBottom: "1px dashed #666", display: "inline-block", minWidth: "48px" }} />
      ) : (
        <span style={S.value}>{value || "\u00A0"}</span>
      )}
    </div>
  );
}

function LinePair({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
}) {
  return (
    <div style={{ ...S.text, marginBottom: "5px" }}>
      <span style={S.bold}>{leftLabel}</span> <span style={S.value}>{leftValue}</span>
      {" · "}
      <span style={S.bold}>{rightLabel}</span> <span style={S.value}>{rightValue}</span>
    </div>
  );
}
