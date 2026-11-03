import { describe, expect, it } from 'vitest';
import {
  calcularIdade,
  dataIsoValida,
  ehAdmin,
  ESTADOS_ACESSO,
  estadoDeAcesso,
  usuarioPodeAcessar,
  validarDadosPerfil,
} from './usuarios.js';

const aceite = { versao: '1' };
const hoje = new Date(Date.UTC(2026, 10, 3));

describe('estadoDeAcesso', () => {
  it('sem perfil, precisa completar o cadastro', () => {
    expect(estadoDeAcesso(null)).toBe(ESTADOS_ACESSO.COMPLETAR);
    expect(estadoDeAcesso(undefined)).toBe(ESTADOS_ACESSO.COMPLETAR);
  });

  it('sem aceite LGPD, precisa completar o cadastro', () => {
    expect(estadoDeAcesso({ ativo: true, aprovado: true })).toBe(ESTADOS_ACESSO.COMPLETAR);
  });

  it('com aceite e sem aprovação, fica pendente', () => {
    expect(estadoDeAcesso({ ativo: true, aprovado: false, aceiteLgpd: aceite })).toBe(ESTADOS_ACESSO.PENDENTE);
  });

  it('usuário inativo fica bloqueado, mesmo aprovado', () => {
    expect(estadoDeAcesso({ ativo: false, aprovado: true, aceiteLgpd: aceite })).toBe(ESTADOS_ACESSO.BLOQUEADO);
    expect(estadoDeAcesso({ aprovado: true, aceiteLgpd: aceite })).toBe(ESTADOS_ACESSO.BLOQUEADO);
  });

  it('aprovado, ativo e com aceite acessa o sistema', () => {
    const perfil = { ativo: true, aprovado: true, aceiteLgpd: aceite };
    expect(estadoDeAcesso(perfil)).toBe(ESTADOS_ACESSO.ATIVO);
    expect(usuarioPodeAcessar(perfil)).toBe(true);
  });
});

describe('ehAdmin', () => {
  it('exige papel admin, aprovado e ativo', () => {
    expect(ehAdmin({ role: 'admin', aprovado: true, ativo: true })).toBe(true);
    expect(ehAdmin({ role: 'admin', aprovado: false, ativo: true })).toBe(false);
    expect(ehAdmin({ role: 'admin', aprovado: true, ativo: false })).toBe(false);
    expect(ehAdmin({ role: 'atleta', aprovado: true, ativo: true })).toBe(false);
    expect(ehAdmin(null)).toBe(false);
  });
});

describe('dataIsoValida', () => {
  it('aceita datas reais', () => {
    expect(dataIsoValida('1990-02-28')).toBe(true);
    expect(dataIsoValida('2000-02-29')).toBe(true);
  });

  it('rejeita formato errado e datas inexistentes', () => {
    expect(dataIsoValida('1990-02-30')).toBe(false);
    expect(dataIsoValida('2001-02-29')).toBe(false);
    expect(dataIsoValida('01/02/1990')).toBe(false);
    expect(dataIsoValida(19900101)).toBe(false);
  });
});

describe('calcularIdade', () => {
  it('conta o aniversário só depois de completado', () => {
    expect(calcularIdade('1990-11-03', hoje)).toBe(36);
    expect(calcularIdade('1990-11-04', hoje)).toBe(35);
  });
});

describe('validarDadosPerfil', () => {
  it('normaliza o nome e aceita data de nascimento opcional', () => {
    const r = validarDadosPerfil({ nome: '  Maria   da Silva ', dataNascimento: '' }, hoje);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ nome: 'Maria da Silva', dataNascimento: null });
  });

  it('rejeita nome curto, longo ou ausente', () => {
    expect(validarDadosPerfil({ nome: 'A' }, hoje).valido).toBe(false);
    expect(validarDadosPerfil({ nome: 'x'.repeat(81) }, hoje).valido).toBe(false);
    expect(validarDadosPerfil({}, hoje).valido).toBe(false);
    expect(validarDadosPerfil({ nome: 42 }, hoje).valido).toBe(false);
  });

  it('rejeita data inválida, futura ou fora do intervalo de idade', () => {
    expect(validarDadosPerfil({ nome: 'Ana', dataNascimento: '1990-13-01' }, hoje).valido).toBe(false);
    expect(validarDadosPerfil({ nome: 'Ana', dataNascimento: '2030-01-01' }, hoje).valido).toBe(false);
    expect(validarDadosPerfil({ nome: 'Ana', dataNascimento: '1900-01-01' }, hoje).valido).toBe(false);
  });

  it('mantém a data de nascimento válida', () => {
    const r = validarDadosPerfil({ nome: 'Ana', dataNascimento: '1985-06-15' }, hoje);
    expect(r.valido).toBe(true);
    expect(r.valores.dataNascimento).toBe('1985-06-15');
  });
});
