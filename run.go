package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"sync"
)

func runCommand(threadID int, wg *sync.WaitGroup) {
	defer wg.Done() // Decrementa el contador cuando termine la goroutine

	command := fmt.Sprintf("node ./lib/index.js mitos_voice_%d", threadID)

	// Ejecutar el comando
	cmd := exec.Command("cmd", "/C", command)
	output, err := cmd.CombinedOutput() // Captura la salida y el error

	if err != nil {
		fmt.Printf("Hilo %d falló: %v\n", threadID, err)
	} else {
		fmt.Printf("Hilo %d: %s\n", threadID, output)
	}
}

func main() {
	// Establecer el número de núcleos de CPU disponibles
	numCPU := runtime.NumCPU()
	runtime.GOMAXPROCS(numCPU) // Asignar todos los núcleos disponibles para la ejecución de goroutines

	// Lanzar un número de goroutines igual al número de hilos disponibles en el sistema
	numGoroutines := numCPU // Usar el mismo número de goroutines que núcleos

	var wg sync.WaitGroup

	// Lanzar las goroutines
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1) // Aumentar el contador del WaitGroup
		go runCommand(i, &wg) // Llamar a runCommand como goroutine
	}

	// Esperar a que todas las goroutines terminen
	wg.Wait()
}
