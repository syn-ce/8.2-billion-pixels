package main

func IntPow(base, exp int) int {
	if exp == 0 {
		return 1
	}

	if exp == 1 {
		return base
	}

	result := base
	for i := 2; i <= exp; i++ {
		result *= base
	}

	return result
}
