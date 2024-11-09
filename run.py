from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess

def run_command(thread_id):
    command = f'node ./lib/index.js mitos_voice_{thread_id}'
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        result.check_returncode()  
        return f"Hilo {thread_id}: {result.stdout.strip()}"
    except subprocess.CalledProcessError as e:
        return f"Hilo {thread_id} falló: {e}"

def main():
    num_threads = 25

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(run_command, i) for i in range(num_threads)]

        for future in as_completed(futures):
            print(future.result())

if __name__ == "__main__":
    main()

