import React from "react";
import { Receipt, CompanyProfile } from "../types";
import { formatBRL, formatDecimal, formatDateBR, formatDateTimeFooter } from "../utils/format";
import { SITE_LOGO_URL } from "../constants/branding";
import { formatCompanyAddressForPrint } from "../utils/companyAddress";

interface ReceiptPrintoutProps {
  receipt: Partial<Receipt>;
  company: CompanyProfile;
  isBlank?: boolean;
  /** Só o espelho do modal de impressão deve ter id para exportar PDF */
  printRootId?: string;
}

const S = {
  doc: {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "11px",
    lineHeight: 1.35,
    color: "#000",
    background: "#fff",
    boxSizing: "border-box" as const,
    width: "100%",
    maxWidth: "182mm",
    margin: "0 auto",
    padding: "0",
  },
  text: { fontSize: "11px" },
  textSm: { fontSize: "10.5px" },
  cell: { padding: "3px 5px", verticalAlign: "top" as const, fontSize: "11px" },
  cellBox: {
    padding: "3px 5px",
    verticalAlign: "top" as const,
    border: "1px solid #000",
    fontSize: "11px",
  },
  borderB: { borderBottom: "1px solid #000" },
  borderR: { borderRight: "1px solid #000" },
  bold: { fontWeight: 700 },
  title: {
    fontWeight: 700,
    fontSize: "13px",
    textAlign: "center" as const,
    textDecoration: "underline",
    textTransform: "uppercase" as const,
    padding: "6px 5px 5px",
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: "11.5px",
    textDecoration: "underline",
  },
};

/** Layout ESPELHO DE FRETE / VIAGEM — otimizado para impressão A4 sem cortar laterais */
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

  const issuedAt = receipt.created_at ? new Date(receipt.created_at) : new Date();

  const faturaNome = isBlank
    ? ""
    : receipt.fatura_nome?.trim() || receipt.motorista_nome?.trim() || "";
  const agenteNome = isBlank
    ? ""
    : receipt.agente_nome?.trim() || receipt.motorista_nome?.trim() || "";

  const logoSrc = company.logo_base64 || SITE_LOGO_URL;

  return (
    <div
      {...(printRootId ? { id: printRootId } : {})}
      className="receipt-a4"
      style={S.doc}
    >
      {/* Cabeçalho: logo à esquerda + todos os dados da empresa à direita */}
      <table
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}
        cellPadding={0}
        cellSpacing={0}
      >
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "74%" }} />
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
                padding: "6px 4px",
                minHeight: "78px",
              }}
            >
              <img
                src={logoSrc}
                alt="Logo"
                style={{
                  maxWidth: "100%",
                  width: "auto",
                  maxHeight: "78px",
                  minHeight: "56px",
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </td>
            <td style={{ ...S.cell, paddingBottom: "4px" }}>
              <div style={{ ...S.bold, fontSize: "12.5px", lineHeight: 1.25, marginBottom: "3px" }}>
                {companyName}
              </div>
              {addressLines.line1 ? (
                <div style={{ ...S.textSm, lineHeight: 1.3, marginBottom: "2px" }}>{addressLines.line1}</div>
              ) : null}
              {addressLines.line2 ? (
                <div style={{ ...S.textSm, lineHeight: 1.3, marginBottom: "3px" }}>{addressLines.line2}</div>
              ) : null}
              <table style={{ width: "100%", ...S.textSm, lineHeight: 1.35 }} cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ width: "58%", paddingRight: "4px" }}>
                      <span style={S.bold}>CNPJ:</span> {v(company.cnpj)}
                    </td>
                    <td style={{ width: "42%" }}>
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
                      <span style={S.bold}>{v(receipt.numero_recibo, "—")}</span>
                    </td>
                    <td>
                      <span style={S.bold}>Data:</span>{" "}
                      <span style={S.bold}>{formatDateBR(receipt.data_recibo, isBlank)}</span>
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
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}>
        <tbody>
          <tr>
            <td style={{ ...S.cell, width: "50%", ...S.borderR }}>
              <Field label="Remetente:" value={v(receipt.remetente_nome)} isBlank={isBlank} />
              <Field label="Endereço:" value={v(receipt.remetente_endereco)} isBlank={isBlank} />
              <span style={S.text}>
                <span style={S.bold}>Cidade:</span> {v(receipt.remetente_cidade)}{" "}
                <span style={S.bold}>UF:</span> {v(receipt.remetente_estado)}
              </span>
              <Field label="CNPJ / CPF:" value={v(receipt.remetente_cnpj_cpf)} isBlank={isBlank} />
            </td>
            <td style={{ ...S.cell, width: "50%" }}>
              <Field label="Destinatário:" value={v(receipt.destinatario_nome)} isBlank={isBlank} />
              <Field label="Endereço:" value={v(receipt.destinatario_endereco)} isBlank={isBlank} />
              <span style={S.text}>
                <span style={S.bold}>Cidade:</span> {v(receipt.destinatario_cidade)}{" "}
                <span style={S.bold}>UF:</span> {v(receipt.destinatario_estado)}
              </span>
              <Field label="CNPJ / CPF:" value={v(receipt.destinatario_cnpj_cpf)} isBlank={isBlank} />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...S.cell, ...S.borderB, ...S.text }}>
        <span style={S.bold}>Obs.:</span> {obsText || "\u00A0"}
      </div>

      {/* Mercadoria Transportada — grade como no espelho original */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <tbody>
          <tr>
            <td colSpan={12} style={S.cellBox}>
              <span style={S.sectionTitle}>Mercadoria Transportada</span>
            </td>
          </tr>
          <tr>
            <td colSpan={12} style={S.cellBox}>
              <span style={S.bold}>Documento Fiscal:</span>{" "}
              {v(receipt.mercadoria_documento_fiscal)}
              {receipt.mercadoria_documento_fiscal && !isBlank ? ";" : ""}
            </td>
          </tr>
          <tr>
            <td colSpan={12} style={S.cellBox}>
              <span style={S.bold}>Mercadoria:</span> {v(receipt.mercadoria_natureza)}
              {receipt.mercadoria_natureza && !isBlank ? ";" : ""}
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.bold}>Quantidade:</span>{" "}
              {formatDecimal(receipt.mercadoria_quantidade, isBlank, 2)}
            </td>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.bold}>Peso:</span> {formatDecimal(receipt.mercadoria_peso, isBlank, 2)}
            </td>
            <td colSpan={4} style={S.cellBox}>
              <span style={S.bold}>Valor da Mercadoria:</span> {formatBRL(receipt.mercadoria_valor, isBlank)}
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={S.cellBox}>
              <span style={S.bold}>Valor ICMS:</span> {formatBRL(receipt.valor_icms, isBlank)}
            </td>
            <td colSpan={3} style={S.cellBox}>
              <span style={S.bold}>Valor Seguro:</span> {formatBRL(receipt.valor_seguro, isBlank)}
            </td>
            <td colSpan={3} style={S.cellBox}>
              <span style={S.bold}>Outros Valores:</span> {formatBRL(receipt.valor_outros, isBlank)}
            </td>
            <td colSpan={3} style={S.cellBox}>
              <span style={S.bold}>Total:</span>{" "}
              <span style={S.bold}>{formatBRL(receipt.valor_total_frete, isBlank)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...S.cell, paddingTop: "5px" }}>
        <span style={S.sectionTitle}>Veículo</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", ...S.borderB }}>
        <tbody>
          <tr>
            <td style={{ ...S.cell, width: "50%", ...S.borderR }}>
              <Field label="Motorista:" value={v(receipt.motorista_nome)} isBlank={isBlank} />
              <Field label="CPF:" value={v(receipt.motorista_cpf)} isBlank={isBlank} />
              <span style={S.text}>
                <span style={S.bold}>Placa:</span> {v(receipt.veiculo_placa)}{" "}
                <span style={S.bold}>UF:</span> {v(receipt.veiculo_estado)}
              </span>
            </td>
            <td style={{ ...S.cell, width: "50%" }}>
              <Field label="Fatura:" value={v(faturaNome)} isBlank={isBlank} />
              <Field label="Agente:" value={v(agenteNome)} isBlank={isBlank} />
            </td>
          </tr>
        </tbody>
      </table>

      <p
        style={{
          marginTop: "10px",
          fontSize: "9.5px",
          color: "#444",
          textAlign: "right",
          paddingRight: "4px",
          paddingLeft: "4px",
        }}
      >
        Fim do Relatório — Emitido por M.A.F Transportes e Seguros de Cargas em{" "}
        {formatDateTimeFooter(issuedAt)}
      </p>
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
    <div style={{ marginBottom: "3px", ...S.text, wordBreak: "break-word" }}>
      <span style={S.bold}>{label}</span>{" "}
      {isBlank && !value.trim() ? (
        <span style={{ borderBottom: "1px dashed #999", display: "inline-block", minWidth: "40px" }} />
      ) : (
        value || "\u00A0"
      )}
    </div>
  );
}
