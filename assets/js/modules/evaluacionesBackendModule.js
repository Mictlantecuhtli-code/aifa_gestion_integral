import { supabaseDb } from "../supabaseClient.js";

function buildError(message, details = null) {
  return { ok: false, error: message, details };
}

function buildSuccess(payload) {
  return { ok: true, data: payload };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAnswer(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => normalizeAnswer(item));
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeAnswer(value[key]);
        return acc;
      }, {});
  }
  if (typeof value === "string") return value.trim();
  return value;
}

function isCorrectAnswer(pregunta, respuestaUsuario) {
  const correct = normalizeAnswer(pregunta.respuesta_correcta);
  const user = normalizeAnswer(respuestaUsuario);

  if (correct === null || correct === undefined) return false;
  if (Array.isArray(correct)) {
    if (!Array.isArray(user)) return false;
    if (correct.length !== user.length) return false;
    return correct.every((item, index) => JSON.stringify(item) === JSON.stringify(user[index]));
  }

  return JSON.stringify(correct) === JSON.stringify(user);
}

async function fetchEvaluacionContext(evaluacionId) {
  return supabaseDb
    .from("evaluaciones")
    .select(
      `id,leccion_id,intentos_max,tiempo_limite,activo,calificacion_minima,
       lecciones:leccion_id(id,modulo_id,modulos:modulo_id(id,curso_id))`
    )
    .eq("id", evaluacionId)
    .maybeSingle();
}

async function fetchCursoAsignacion(cursoId, usuarioId) {
  return supabaseDb
    .from("cursos_usuarios")
    .select("id,curso_id,usuario_id,estatus")
    .eq("curso_id", cursoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
}

async function fetchVersionesDisponibles(evaluacionId) {
  return supabaseDb
    .from("evaluaciones_versiones")
    .select("id,numero_version,preguntas")
    .eq("evaluacion_id", evaluacionId)
    .order("numero_version", { ascending: true });
}

async function fetchIntentosPrevios(evaluacionId, usuarioId) {
  return supabaseDb
    .from("evaluaciones_intentos")
    .select("id")
    .eq("evaluacion_id", evaluacionId)
    .eq("usuario_id", usuarioId)
    .order("fecha_inicio", { ascending: true });
}

async function registrarAuditoria({ usuarioId, accion, descripcion, ip }) {
  if (!usuarioId || !accion) return;
  await supabaseDb.from("auditoria").insert({
    usuario_id: usuarioId,
    accion,
    descripcion,
    ip: ip ?? null,
    created_at: nowIso()
  });
}

async function ensureAttemptOwnership(intentoId, usuarioId) {
  const { data, error } = await supabaseDb
    .from("evaluaciones_intentos")
    .select("id,usuario_id,evaluacion_id,version_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
    .eq("id", intentoId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "El intento indicado no existe." };
  }

  if (usuarioId && data.usuario_id !== usuarioId) {
    return { ok: false, error: "No tienes permisos para acceder a este intento." };
  }

  return { ok: true, data };
}

export const evaluacionesBackendModule = {
  async iniciar_examen(evaluacionId, usuarioId, ipOrigen) {
    if (!evaluacionId || !usuarioId) {
      return buildError("Parámetros insuficientes para iniciar el examen.");
    }

    const { data: evaluacion, error: evalError } = await fetchEvaluacionContext(evaluacionId);
    if (evalError || !evaluacion) {
      return buildError("No fue posible obtener la información de la evaluación.", evalError?.message);
    }

    if (!evaluacion.activo) {
      return buildError("La evaluación no está activa actualmente.");
    }

    const cursoId = evaluacion?.lecciones?.modulos?.curso_id;
    if (!cursoId) {
      return buildError("La evaluación no está asociada a un curso válido.");
    }

    const { data: asignacion } = await fetchCursoAsignacion(cursoId, usuarioId);
    if (!asignacion) {
      return buildError("El usuario no está inscrito en el curso asociado a la evaluación.");
    }

    const { data: intentosPrevios, error: intentosError } = await fetchIntentosPrevios(evaluacionId, usuarioId);
    if (intentosError) {
      return buildError("No fue posible validar los intentos previos del usuario.", intentosError?.message);
    }

    if (evaluacion.intentos_max && intentosPrevios.length >= evaluacion.intentos_max) {
      return buildError("Has alcanzado el número máximo de intentos permitidos para esta evaluación.");
    }

    const { data: versiones, error: versionesError } = await fetchVersionesDisponibles(evaluacionId);
    if (versionesError || !versiones?.length) {
      return buildError("No hay versiones disponibles para esta evaluación.");
    }

    const seleccionada = versiones[Math.floor(Math.random() * versiones.length)];
    const inicio = new Date();
    const finPermitida = evaluacion.tiempo_limite
      ? new Date(inicio.getTime() + Number(evaluacion.tiempo_limite) * 60000)
      : null;

    const payload = {
      usuario_id: usuarioId,
      evaluacion_id: evaluacionId,
      version_id: seleccionada.id,
      intento_num: intentosPrevios.length + 1,
      fecha_inicio: inicio.toISOString(),
      estado: "en_progreso"
    };

    const { data: intento, error: insertError } = await supabaseDb
      .from("evaluaciones_intentos")
      .insert(payload)
      .select("id,version_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
      .maybeSingle();

    if (insertError || !intento) {
      return buildError("No fue posible registrar el intento del examen.", insertError?.message);
    }

    await registrarAuditoria({
      usuarioId,
      accion: "iniciar_examen",
      descripcion: `Inicio de examen ${evaluacionId} (versión ${seleccionada.id}).`,
      ip: ipOrigen
    });

    return buildSuccess({
      intento_id: intento.id,
      version_id: intento.version_id,
      tiempo_limite: evaluacion.tiempo_limite ?? null,
      fecha_inicio: intento.fecha_inicio,
      fecha_fin_permitida: finPermitida ? finPermitida.toISOString() : null
    });
  },

  async evaluaciones_disponibles_para_alumno(usuarioId, filtros = {}) {
    if (!usuarioId) return buildError("Debes indicar un usuario para consultar evaluaciones disponibles.");

    const { data: cursosAsignados, error: cursosError } = await supabaseDb
      .from("cursos_usuarios")
      .select("curso_id")
      .eq("usuario_id", usuarioId);

    if (cursosError) {
      return buildError("No fue posible validar los cursos asignados al alumno.", cursosError?.message);
    }

    const cursoIds = new Set((cursosAsignados ?? []).map((item) => item.curso_id));
    if (!cursoIds.size) {
      return buildSuccess({ evaluaciones: [] });
    }

    let evaluacionesQuery = supabaseDb
      .from("evaluaciones")
      .select(
        `id,titulo,descripcion,tiempo_limite,intentos_max,activo,leccion_id,
         lecciones:leccion_id(id,nombre,modulo_id,
           modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(nombre))
         )`
      )
      .eq("activo", true);

    if (filtros.leccionId) evaluacionesQuery = evaluacionesQuery.eq("leccion_id", filtros.leccionId);

    const { data: evaluaciones, error: evaluacionesError } = await evaluacionesQuery;
    if (evaluacionesError) {
      return buildError("No fue posible recuperar las evaluaciones disponibles.", evaluacionesError?.message);
    }

    const elegibles = (evaluaciones ?? []).filter((eva) => cursoIds.has(eva?.lecciones?.modulos?.curso_id));
    const evaluacionIds = elegibles.map((eva) => eva.id);

    const { data: intentosAlumno } = await supabaseDb
      .from("evaluaciones_intentos")
      .select("id,evaluacion_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
      .eq("usuario_id", usuarioId)
      .in("evaluacion_id", evaluacionIds)
      .order("fecha_inicio", { ascending: false });

    const intentosPorEvaluacion = (intentosAlumno ?? []).reduce((acc, intento) => {
      if (!acc[intento.evaluacion_id]) acc[intento.evaluacion_id] = [];
      acc[intento.evaluacion_id].push(intento);
      return acc;
    }, {});

    const respuesta = elegibles.map((eva) => {
      const intentos = intentosPorEvaluacion[eva.id] ?? [];
      const ultimoIntento = intentos[0] ?? null;
      const maxIntentos = Number(eva.intentos_max ?? 0);
      const permiteMasIntentos = maxIntentos ? intentos.length < maxIntentos : true;

      return {
        evaluacion_id: eva.id,
        titulo: eva.titulo,
        descripcion: eva.descripcion,
        leccion: eva.lecciones?.nombre ?? "",
        curso: eva.lecciones?.modulos?.cursos?.nombre ?? "",
        tiempo_limite: eva.tiempo_limite ?? null,
        intentos_realizados: intentos.length,
        ultimo_intento: ultimoIntento,
        puede_iniciar: permiteMasIntentos || (ultimoIntento?.estado === "en_progreso"),
        intento_en_progreso: intentos.find((i) => i.estado === "en_progreso") ?? null
      };
    });

    return buildSuccess({ evaluaciones: respuesta });
  },

  async obtener_preguntas(intentoId) {
    const { data: intento, error: intentoError } = await supabaseDb
      .from("evaluaciones_intentos")
      .select("id,version_id,estado,fecha_inicio,versiones:version_id(preguntas)")
      .eq("id", intentoId)
      .maybeSingle();

    if (intentoError || !intento) {
      return buildError("No se encontró el intento solicitado.", intentoError?.message);
    }

    if (!intento.versiones?.preguntas?.length) {
      return buildError("La versión asignada no tiene preguntas configuradas.");
    }

    const preguntasIds = intento.versiones.preguntas;
    const { data: preguntas, error: preguntasError } = await supabaseDb
      .from("banco_preguntas")
      .select("id,enunciado,tipo,opciones,respuesta_correcta,dificultad")
      .in("id", preguntasIds)
      .eq("activo", true);

    if (preguntasError) {
      return buildError("No fue posible recuperar las preguntas de la evaluación.", preguntasError?.message);
    }

    const { data: adjuntos } = await supabaseDb
      .from("banco_preguntas_adjuntos")
      .select("id,pregunta_id,url_archivo,tipo")
      .in("pregunta_id", preguntasIds);

    const adjuntosPorPregunta = (adjuntos ?? []).reduce((acc, item) => {
      if (!acc[item.pregunta_id]) acc[item.pregunta_id] = [];
      acc[item.pregunta_id].push({ id: item.id, url: item.url_archivo, tipo: item.tipo });
      return acc;
    }, {});

    const ordered = preguntasIds
      .map((preguntaId, index) => {
        const found = preguntas?.find((p) => p.id === preguntaId);
        if (!found) return null;
        return {
          id: found.id,
          enunciado: found.enunciado,
          tipo: found.tipo,
          opciones: found.opciones ?? [],
          adjuntos: adjuntosPorPregunta[found.id] ?? [],
          orden: index + 1
        };
      })
      .filter(Boolean);

    return buildSuccess({ preguntas: ordered, intento_id: intentoId, version_id: intento.version_id });
  },

  async registrar_respuesta(intentoId, preguntaId, respuestaJson) {
    if (!intentoId || !preguntaId) {
      return buildError("Debes indicar un intento y una pregunta para registrar la respuesta.");
    }

    const intentoCheck = await ensureAttemptOwnership(intentoId);
    if (!intentoCheck.ok) return intentoCheck;
    const intento = intentoCheck.data;

    if (intento.estado !== "en_progreso") {
      return buildError("El intento no está en progreso, no es posible registrar respuestas.");
    }

    const { data: versionDetalle, error: versionError } = await supabaseDb
      .from("evaluaciones_versiones")
      .select("id,preguntas")
      .eq("id", intento.version_id)
      .maybeSingle();

    if (versionError || !versionDetalle) {
      return buildError("No fue posible validar la versión asignada.", versionError?.message);
    }

    if (!versionDetalle.preguntas?.includes(preguntaId)) {
      return buildError("La pregunta indicada no forma parte de la versión del examen.");
    }

    const payload = {
      intento_id: intentoId,
      pregunta_id: preguntaId,
      respuesta: respuestaJson,
      correcta: null,
      created_at: nowIso()
    };

    const { error: upsertError } = await supabaseDb
      .from("evaluaciones_respuestas")
      .upsert(payload, { onConflict: "intento_id,pregunta_id" });

    if (upsertError) {
      return buildError("No se pudo registrar la respuesta del alumno.", upsertError?.message);
    }

    return buildSuccess({ intento_id: intentoId, pregunta_id: preguntaId, guardado: true });
  },

  async detalle_intento_alumno(intentoId, usuarioId) {
    const intentoCheck = await ensureAttemptOwnership(intentoId, usuarioId);
    if (!intentoCheck.ok) return intentoCheck;

    const intento = intentoCheck.data;
    const { data: respuestas, error: respuestasError } = await supabaseDb
      .from("evaluaciones_respuestas")
      .select("pregunta_id,respuesta,correcta,banco_preguntas:pregunta_id(enunciado,respuesta_correcta)")
      .eq("intento_id", intentoId);

    if (respuestasError) {
      return buildError("No fue posible obtener las respuestas del intento.", respuestasError?.message);
    }

    const detalleRespuestas = (respuestas ?? []).map((item) => ({
      pregunta_id: item.pregunta_id,
      enunciado: item.banco_preguntas?.enunciado ?? "Pregunta",
      respuesta_usuario: item.respuesta,
      respuesta_correcta: item.banco_preguntas?.respuesta_correcta ?? null,
      acierto: Boolean(item.correcta)
    }));

    return buildSuccess({
      intento: {
        id: intento.id,
        evaluacion_id: intento.evaluacion_id,
        version_id: intento.version_id,
        intento_num: intento.intento_num,
        fecha_inicio: intento.fecha_inicio,
        fecha_fin: intento.fecha_fin,
        calificacion: intento.calificacion,
        aprobado: intento.aprobado,
        estado: intento.estado
      },
      respuestas: detalleRespuestas
    });
  },

  async finalizar_examen(intentoId, { usuarioId = null, ipOrigen = null } = {}) {
    const intentoCheck = await ensureAttemptOwnership(intentoId, usuarioId);
    if (!intentoCheck.ok) return intentoCheck;
    const intento = intentoCheck.data;

    if (intento.estado !== "en_progreso") {
      return buildError("El intento ya fue finalizado previamente.");
    }

    const { data: evaluacionDetalle, error: evaluacionError } = await supabaseDb
      .from("evaluaciones")
      .select("id,calificacion_minima,tiempo_limite")
      .eq("id", intento.evaluacion_id)
      .maybeSingle();

    if (evaluacionError || !evaluacionDetalle) {
      return buildError("No fue posible obtener la configuración de la evaluación.", evaluacionError?.message);
    }

    const { data: versionDetalle, error: versionError } = await supabaseDb
      .from("evaluaciones_versiones")
      .select("id,preguntas")
      .eq("id", intento.version_id)
      .maybeSingle();

    if (versionError || !versionDetalle) {
      return buildError("No se pudo obtener la versión asignada al intento.", versionError?.message);
    }

    const { data: preguntas, error: preguntasError } = await supabaseDb
      .from("banco_preguntas")
      .select("id,tipo,respuesta_correcta")
      .in("id", versionDetalle.preguntas ?? []);

    if (preguntasError) {
      return buildError("No fue posible obtener las preguntas de la versión.", preguntasError?.message);
    }

    const { data: respuestasPrevias } = await supabaseDb
      .from("evaluaciones_respuestas")
      .select("id,intento_id,pregunta_id,respuesta,correcta")
      .eq("intento_id", intentoId);

    const respuestasPorPregunta = new Map();
    (respuestasPrevias ?? []).forEach((resp) => {
      respuestasPorPregunta.set(resp.pregunta_id, resp);
    });

    const now = new Date();
    const start = new Date(intento.fecha_inicio);
    const limiteMinutos = Number(evaluacionDetalle.tiempo_limite);
    const limiteFecha = limiteMinutos ? new Date(start.getTime() + limiteMinutos * 60000) : null;
    const fueraDeTiempo = limiteFecha ? now > limiteFecha : false;

    let respuestasCorrectas = 0;
    const respuestasParaGuardar = [];

    preguntas.forEach((pregunta) => {
      const respuestaUsuario = respuestasPorPregunta.get(pregunta.id)?.respuesta ?? null;
      const correcta = isCorrectAnswer(pregunta, respuestaUsuario);
      if (correcta) respuestasCorrectas += 1;

      respuestasParaGuardar.push({
        intento_id: intentoId,
        pregunta_id: pregunta.id,
        respuesta: respuestaUsuario,
        correcta,
        created_at: nowIso()
      });
    });

    if (respuestasParaGuardar.length) {
      await supabaseDb
        .from("evaluaciones_respuestas")
        .upsert(respuestasParaGuardar, { onConflict: "intento_id,pregunta_id" });
    }

    const totalPreguntas = preguntas.length || 1;
    const calificacion = Number(((respuestasCorrectas / totalPreguntas) * 100).toFixed(2));
    const aprobado = calificacion >= (evaluacionDetalle.calificacion_minima ?? 60);

    const { error: updateError } = await supabaseDb
      .from("evaluaciones_intentos")
      .update({
        fecha_fin: now.toISOString(),
        calificacion,
        aprobado,
        estado: "terminado"
      })
      .eq("id", intentoId);

    if (updateError) {
      return buildError("No se pudo cerrar el intento de la evaluación.", updateError?.message);
    }

    await registrarAuditoria({
      usuarioId: usuarioId ?? intento.usuario_id,
      accion: "finalizar_examen",
      descripcion: `Intento ${intentoId} finalizado con calificación ${calificacion}.`,
      ip: ipOrigen
    });

    return buildSuccess({
      calificacion,
      aprobado,
      respuestas_correctas: respuestasCorrectas,
      respuestas_totales: totalPreguntas,
      fuera_de_tiempo: fueraDeTiempo
    });
  },

  async listar_intentos(evaluacionId, filtros = {}) {
    if (!evaluacionId) return buildError("Debes indicar una evaluación para listar intentos.");

    let query = supabaseDb
      .from("evaluaciones_intentos")
      .select(
        "id,usuario_id,evaluacion_id,version_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado,usuarios:usuario_id(nombre,apellido,correo)"
      )
      .eq("evaluacion_id", evaluacionId)
      .order("fecha_inicio", { ascending: false });

    if (filtros.alumnoId) query = query.eq("usuario_id", filtros.alumnoId);
    if (filtros.estado) query = query.eq("estado", filtros.estado);
    if (filtros.fechaDesde) query = query.gte("fecha_inicio", filtros.fechaDesde);
    if (filtros.fechaHasta) query = query.lte("fecha_fin", filtros.fechaHasta);

    const { data, error } = await query;
    if (error) {
      return buildError("No fue posible obtener los intentos de la evaluación.", error?.message);
    }

    return buildSuccess({ intentos: data ?? [] });
  },

  async obtener_respuestas_de_intento(intentoId) {
    const { data, error } = await supabaseDb
      .from("evaluaciones_respuestas")
      .select("pregunta_id,respuesta,correcta,banco_preguntas:pregunta_id(enunciado,respuesta_correcta)")
      .eq("intento_id", intentoId);

    if (error) {
      return buildError("No fue posible recuperar las respuestas del intento.", error?.message);
    }

    const respuestas = (data ?? []).map((item) => ({
      pregunta_id: item.pregunta_id,
      pregunta: item.banco_preguntas?.enunciado ?? "Pregunta",
      respuesta_usuario: item.respuesta,
      respuesta_correcta: item.banco_preguntas?.respuesta_correcta ?? null,
      acierto: Boolean(item.correcta)
    }));

    return buildSuccess({ intento_id: intentoId, respuestas });
  },

  async consolidado_de_evaluacion(evaluacionId) {
    if (!evaluacionId) return buildError("Debes indicar una evaluación para generar el consolidado.");

    const { data, error } = await supabaseDb
      .from("evaluaciones_intentos")
      .select("usuario_id,calificacion,aprobado,estado")
      .eq("evaluacion_id", evaluacionId)
      .eq("estado", "terminado");

    if (error) {
      return buildError("No fue posible generar el consolidado de la evaluación.", error?.message);
    }

    const intentos = data ?? [];
    if (!intentos.length) {
      return buildSuccess({ promedio: 0, aprobados: 0, reprobados: 0, distribucion: {}, intentos_por_alumno: {} });
    }

    const sumatoria = intentos.reduce((acc, intento) => acc + Number(intento.calificacion ?? 0), 0);
    const promedio = Number((sumatoria / intentos.length).toFixed(2));
    const aprobados = intentos.filter((item) => item.aprobado).length;
    const reprobados = intentos.length - aprobados;

    const distribucion = intentos.reduce((acc, intento) => {
      const base = Math.floor(Number(intento.calificacion ?? 0) / 10) * 10;
      const bucket = `${base}-${base + 9}`;
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {});

    const intentosPorAlumno = intentos.reduce((acc, intento) => {
      acc[intento.usuario_id] = (acc[intento.usuario_id] ?? 0) + 1;
      return acc;
    }, {});

    return buildSuccess({
      promedio,
      aprobados,
      reprobados,
      distribucion,
      intentos_por_alumno: intentosPorAlumno
    });
  }
};
